import { Router, type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../config/openapi';

export const docsRouter = Router();

let cached: ReturnType<typeof buildOpenApiDocument> | undefined;
const document = () => (cached ??= buildOpenApiDocument());

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(document());
});
// Swagger UI needs inline scripts/styles, so it is served with its own relaxed CSP.
docsRouter.use((_req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});
docsRouter.use('/', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) =>
  swaggerUi.setup(document(), { customSiteTitle: 'Atelier API docs' })(req, res, next),
);
