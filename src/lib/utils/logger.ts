class Logger {
  static info = (step: string, name: string, data?: Record<string, unknown>) =>
    console.log({
      ts: new Date().toISOString(),
      step,
      route: name,
      ...(data || {}),
    });

  static error = (step: string, name: string, data?: Record<string, unknown>) =>
    console.error({
      ts: new Date().toISOString(),
      step,
      route: name,
      ...(data || {}),
    });
}

export default Logger;
