let app;

export default async function handler(req, res) {
  if (!app) {
    const module = await import(
      "../artifacts/api-server/dist/vercel.mjs"
    );

    app = module.default;
  }

  return app(req, res);
}
