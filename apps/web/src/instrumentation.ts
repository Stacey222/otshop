export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ getAppConfig }, { logger }] = await Promise.all([
    import("@otshop/config"),
    import("@/infrastructure/logging/logger"),
  ]);
  const config = getAppConfig();

  logger.info("control_plane.starting", {
    features: config.features,
    nodeEnv: config.nodeEnv,
    version: config.appVersion,
  });
}
