/**
 * Centralized logging utility that respects LOG_LEVEL from environment
 * Log levels: debug < info < warning < error
 */

export type LogLevel = "debug" | "info" | "warning" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

class Logger {
  private currentLevel: LogLevel;

  constructor() {
    // Get log level from environment, default to "info"
    const envLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
    this.currentLevel = ["debug", "info", "warning", "error"].includes(envLevel) 
      ? envLevel 
      : "info";
  }

  /**
   * Set the log level programmatically
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Check if a given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel];
  }

  /**
   * Format a log message with timestamp and level
   */
  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(7);
    return `[${timestamp}] ${levelStr} ${message}`;
  }

  /**
   * Debug level logging - most verbose
   * Use for detailed debugging information
   */
  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  /**
   * Info level logging - general information
   * Use for normal operational messages
   */
  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message), ...args);
    }
  }

  /**
   * Warning level logging - potential issues
   * Use for warnings that don't prevent operation
   */
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warning")) {
      console.warn(this.formatMessage("warning", message), ...args);
    }
  }

  /**
   * Error level logging - errors and exceptions
   * Use for errors that need attention
   */
  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }

  /**
   * Log an error object with full details
   */
  logError(message: string, error: unknown, context?: Record<string, any>): void {
    if (this.shouldLog("error")) {
      const errorDetails: any = {
        message: message,
        timestamp: new Date().toISOString(),
      };

      if (error instanceof Error) {
        errorDetails.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        errorDetails.error = String(error);
      }

      if (context) {
        errorDetails.context = context;
      }

      console.error(this.formatMessage("error", message));
      console.error(JSON.stringify(errorDetails, null, 2));
    }
  }

  /**
   * Log detailed debug information with context
   */
  logDebug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message));
      if (context) {
        console.debug(JSON.stringify(context, null, 2));
      }
    }
  }
}

// Export a singleton instance
export const logger = new Logger();

