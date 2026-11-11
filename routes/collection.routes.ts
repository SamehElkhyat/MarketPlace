import { Router } from 'express';
import {
  createCollection,
  deleteCollection,
  getCollection,
  listAllCollections,
  listCollections,
  updateCollection,
} from '../controllers/collection.controller';
import { validate } from '../middleware/validate.middleware';
import {
  collectionIdSchemas,
  collectionSlugSchemas,
  createCollectionSchemas,
  updateCollectionSchemas,
} from '../validators/collection.validators';

/** Public — mounted at `/api/collections`. */
export const collectionRouter = Router();
collectionRouter.get('/', listCollections);
collectionRouter.get('/:slug', validate(collectionSlugSchemas), getCollection);

/** Mounted under `/api/admin/collections`. */
export const collectionAdminRouter = Router();
collectionAdminRouter.get('/', listAllCollections);
collectionAdminRouter.post('/', validate(createCollectionSchemas), createCollection);
collectionAdminRouter.patch('/:id', validate(updateCollectionSchemas), updateCollection);
collectionAdminRouter.delete('/:id', validate(collectionIdSchemas), deleteCollection);
