/**
 * MessageBus - lightweight event bus for module communication.
 */

export class MessageBus {
  static listeners = {};

  /**
   * Subscribe to an action.
   * Returns an unsubscribe function for cleanup.
   * @param {string} action
   * @param {(data: any) => void} callback
   * @returns {() => void}
   */
  static on(action, callback) {
    if (!this.listeners[action]) {
      this.listeners[action] = [];
    }
    this.listeners[action].push(callback);
    return () => this.off(action, callback);
  }

  /**
   * Unsubscribe a callback from an action.
   * @param {string} action
   * @param {(data: any) => void} callback
   */
  static off(action, callback) {
    if (!this.listeners[action]) return;
    this.listeners[action] = this.listeners[action].filter((cb) => cb !== callback);
  }

  /**
   * Dispatch an intent object.
   * @param {{action: string, data: any}} intent
   */
  static send(intent) {
    const callbacks = this.listeners[intent.action] || [];
    callbacks.forEach((callback) => {
      try {
        callback(intent.data);
      } catch (error) {
        console.error('[MessageBus] Callback error:', {
          action: intent.action,
          error: error.message
        });
      }
    });
  }

  /**
   * Dispatch an action + data pair.
   * @param {string} action
   * @param {any} data
   */
  static emit(action, data = null) {
    this.send({ action, data });
  }

  /**
   * Remove all listeners.
   */
  static clear() {
    this.listeners = {};
  }
}
