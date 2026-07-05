/**
 * Lazily loads an optional peer dependency, throwing a clear, actionable
 * error when it is not installed. Heavy SDKs (pg, mongodb, aws-sdk, …) are
 * never bundled with the core — they are resolved on demand the first time
 * an exporter that needs them is initialized.
 */
export const loadOptional = async <T = unknown>(
  moduleName: string,
  exporterName: string,
): Promise<T> => {
  try {
    return (await import(moduleName)) as T;
  } catch {
    throw new Error(
      `[logx] ${exporterName} requires the optional peer dependency "${moduleName}". ` +
        `Install it with: npm install ${moduleName}`,
    );
  }
};
