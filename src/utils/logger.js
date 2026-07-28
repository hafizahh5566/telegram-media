/**
 * Logger Utility
 * Provides consistent logging across the application
 */

class Logger {
  /**
   * Log info message
   * @param {string} message - Message to log
   */
  static info(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`);
  }

  /**
   * Log error message
   * @param {string} message - Error message to log
   * @param {Error} [error] - Optional error object
   */
  static error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`);
    if (error) {
      console.error(`[${timestamp}] [ERROR] ${error.stack || error.message}`);
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message to log
   */
  static warn(message) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`);
  }
}

module.exports = Logger;
