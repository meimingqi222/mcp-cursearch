import { ListToolsRequestSchema, ListToolsResultSchema, CallToolRequestSchema, CompatibilityCallToolResultSchema, ListPromptsRequestSchema, ListPromptsResultSchema, ListResourcesRequestSchema, ListResourcesResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import path from "path";
import { createRepositoryIndexer } from "./services/repositoryIndexer.js";
import { createCodeSearcher } from "./services/codeSearcher.js";
import { setActiveWorkspace } from "./services/stateManager.js";
import { logger } from "./utils/logger.js";

export type ServerContext = { authToken: string; baseUrl: string };

export async function createMcpServer(server: any, ctx: ServerContext): Promise<void> {
  const indexer = createRepositoryIndexer(ctx);
  const searcher = createCodeSearcher(ctx, indexer);

  // Zod schema for tool arguments
  const codebaseSearchArgsSchema = z.object({
    query: z.string(),
    paths_include_glob: z.string().optional(),
    paths_exclude_glob: z.string().optional(),
    max_results: z.number().int().positive().optional(),
  });

  const createIndexArgsSchema = z.object({
    workspace_path: z.string(),
  });

  const setWorkspaceArgsSchema = z.object({
    workspace_path: z.string(),
  });

  const getIndexProgressArgsSchema = z.object({
    workspace_path: z.string(),
  });

  // Minimal JSON Schema for MCP tool inputSchema (top-level must be type: "object")
  const codebaseSearchInputJsonSchema = {
    type: "object",
    properties: {
      query: { type: "string" },
      paths_include_glob: { type: "string" },
      paths_exclude_glob: { type: "string" },
      max_results: { type: "integer", minimum: 1 },
    },
    required: ["query"],
  } as const;

  const createIndexInputJsonSchema = {
    type: "object",
    properties: {
      workspace_path: { type: "string" },
    },
    required: ["workspace_path"],
  } as const;

  const setWorkspaceInputJsonSchema = {
    type: "object",
    properties: {
      workspace_path: { type: "string" },
    },
    required: ["workspace_path"],
  } as const;

  const getIndexProgressInputJsonSchema = {
    type: "object",
    properties: {
      workspace_path: { type: "string" },
    },
    required: ["workspace_path"],
  } as const;

  // Indexing task state management (in-memory, per MCP server instance)
  const indexingTasks = new Map<string, {
    status: 'pending' | 'indexing' | 'completed' | 'failed';
    progress: number;
    startTime: number;
    error?: string;
    result?: string;
  }>();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return ListToolsResultSchema.parse({
      tools: [
        {
          name: "create_index",
          description: "Creates an index for a codebase at the specified workspace path. This operation runs asynchronously in the background, so you can continue working while the index is being built. Use get_index_progress to check the status of the indexing operation. The workspace path should be an absolute path to the root of your codebase (e.g., /home/user/my-project or D:\\Projects\\my-project).",
          inputSchema: createIndexInputJsonSchema,
        },
        {
          name: "set_workspace",
          description: "Sets the active workspace that will be used for codebase_search operations. This is equivalent to activating a workspace via the CLI. After setting a workspace, you can immediately use codebase_search to search within it. The workspace path should be an absolute path to the root of your codebase.",
          inputSchema: setWorkspaceInputJsonSchema,
        },
        {
          name: "get_index_progress",
          description: "Gets the current progress and status of an indexing operation for a specific workspace. This can be used to monitor the progress of create_index operations, which run asynchronously. Returns status (pending/indexing/completed/failed), progress percentage, and any error messages if the indexing failed.",
          inputSchema: getIndexProgressInputJsonSchema,
        },
        {
          name: "codebase_search",
          description: "Searches the active workspace's indexed codebase to find code snippets most relevant to a natural language query. This is a semantic search tool, so the query should describe the desired functionality or concept. For best results, use the user's exact phrasing for the `query`, as their specific wording often contains valuable semantic cues. If the search should be limited to specific files or directories, use the `paths_include_glob` and `paths_exclude_glob` parameters to scope the search. NOTE: You must first set a workspace using the set_workspace tool before using this tool.",
          inputSchema: codebaseSearchInputJsonSchema,
        },
      ],
    });
  });

  // No-op prompt/resources handlers to satisfy advertised capabilities
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return ListPromptsResultSchema.parse({ prompts: [] });
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return ListResourcesResultSchema.parse({ resources: [] });
  });

  server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params as { name: string; arguments?: Record<string, unknown> };
    // Friendly guard: ensure auth token is present at call time
    const missingTokenError = () => CompatibilityCallToolResultSchema.parse({
      content: [{ type: "text", text: "Missing CURSOR_AUTH_TOKEN. Pass --auth-token or set env CURSOR_AUTH_TOKEN before using this tool." }],
      isError: true,
    });
    if (!ctx.authToken) {
      return missingTokenError();
    }
    if (name === "create_index") {
      const { workspace_path } = createIndexArgsSchema.parse(args || {});
      const normalizedPath = path.resolve(workspace_path);

      // Check if already indexing
      const existingTask = indexingTasks.get(normalizedPath);
      if (existingTask && (existingTask.status === 'indexing' || existingTask.status === 'pending')) {
        return CompatibilityCallToolResultSchema.parse({
          content: [{ type: "text", text: JSON.stringify({
            workspace_path: normalizedPath,
            status: existingTask.status,
            message: `Indexing already in progress for ${normalizedPath}. Use get_index_progress to check status.`,
          }) }],
        });
      }

      // Initialize task state
      indexingTasks.set(normalizedPath, {
        status: 'pending',
        progress: 0,
        startTime: Date.now(),
      });

      // Start indexing asynchronously (don't await)
      (async () => {
        try {
          indexingTasks.set(normalizedPath, { ...indexingTasks.get(normalizedPath)!, status: 'indexing' });
          logger.info(`Starting index creation for workspace: ${normalizedPath}`);
          await indexer.indexProject({ workspacePath: normalizedPath });
          indexingTasks.set(normalizedPath, {
            status: 'completed',
            progress: 100,
            startTime: indexingTasks.get(normalizedPath)!.startTime,
            result: 'Index created successfully',
          });
          logger.info(`Index creation completed for workspace: ${normalizedPath}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          indexingTasks.set(normalizedPath, {
            status: 'failed',
            progress: 0,
            startTime: indexingTasks.get(normalizedPath)!.startTime,
            error: errorMessage,
          });
          logger.error(`Index creation failed for workspace ${normalizedPath}:`, error);
        }
      })();

      return CompatibilityCallToolResultSchema.parse({
        content: [{ type: "text", text: JSON.stringify({
          workspace_path: normalizedPath,
          status: 'pending',
          message: `Indexing started for ${normalizedPath}. Use get_index_progress to check status.`,
        }) }],
      });
    }
    if (name === "set_workspace") {
      const { workspace_path } = setWorkspaceArgsSchema.parse(args || {});
      const normalizedPath = path.resolve(workspace_path);
      await setActiveWorkspace(normalizedPath);
      logger.info(`Active workspace set to: ${normalizedPath}`);
      return CompatibilityCallToolResultSchema.parse({
        content: [{ type: "text", text: JSON.stringify({
          workspace_path: normalizedPath,
          status: "success",
          message: `Active workspace set to ${normalizedPath}. You can now use codebase_search to search within this workspace.`,
        }) }],
      });
    }
    if (name === "get_index_progress") {
      const { workspace_path } = getIndexProgressArgsSchema.parse(args || {});
      const normalizedPath = path.resolve(workspace_path);
      const task = indexingTasks.get(normalizedPath);

      if (!task) {
        return CompatibilityCallToolResultSchema.parse({
          content: [{ type: "text", text: JSON.stringify({
            workspace_path: normalizedPath,
            status: "not_found",
            message: `No indexing task found for ${normalizedPath}. Use create_index to start indexing.`,
          }) }],
        });
      }

      const elapsedTime = Math.floor((Date.now() - task.startTime) / 1000);
      return CompatibilityCallToolResultSchema.parse({
        content: [{ type: "text", text: JSON.stringify({
          workspace_path: normalizedPath,
          status: task.status,
          progress: task.progress,
          elapsed_seconds: elapsedTime,
          ...(task.error && { error: task.error }),
          ...(task.result && { result: task.result }),
        }) }],
      });
    }
    if (name === "codebase_search") {
      const { query, paths_include_glob, paths_exclude_glob, max_results } = codebaseSearchArgsSchema.parse(args || {});
      const result = await searcher.search({
        query,
        pathsIncludeGlob: paths_include_glob,
        pathsExcludeGlob: paths_exclude_glob,
        maxResults: (typeof max_results === "number" && max_results > 0) ? max_results : 10,
      });
      return CompatibilityCallToolResultSchema.parse({
        content: [{ type: "text", text: JSON.stringify(result) }],
      });
    }
    return CompatibilityCallToolResultSchema.parse({ content: [{ type: "text", text: "Unknown tool" }], isError: true });
  });
}


