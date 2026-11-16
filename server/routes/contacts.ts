import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import {
  contactCreateSchema,
  contactsQuerySchema,
  contactUpdateSchema,
  duplicateContactQuerySchema,
} from '../schemas';
import {
  checkContactEmail,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from '../services/contacts';

export function contactsRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/contacts',
    route((req, res) => {
      res.json(listContacts(db, parseQuery(contactsQuerySchema, req.query)));
    }),
  );
  router.post(
    '/contacts',
    route((req, res) => {
      const contact = createContact(db, parse(contactCreateSchema, req.body));
      res.status(201).location(`/api/v1/contacts/${contact.id}`).json(contact);
    }),
  );
  router.all('/contacts', methodNotAllowed);

  router.get(
    '/contacts/duplicates',
    route((req, res) => {
      const query = parseQuery(duplicateContactQuerySchema, req.query);
      res.json(checkContactEmail(db, query.email));
    }),
  );

  router.get(
    '/contacts/:id',
    route((req, res) => {
      res.json(getContact(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/contacts/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateContact(db, id, parse(contactUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/contacts/:id',
    route((req, res) => {
      deleteContact(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.all('/contacts/:id', methodNotAllowed);

  return router;
}
