import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import {
  companiesQuerySchema,
  companyCreateSchema,
  companyUpdateSchema,
  duplicateCompanyQuerySchema,
} from '../schemas';
import {
  checkCompanyDomain,
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  updateCompany,
} from '../services/companies';

export function companiesRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/companies',
    route((req, res) => {
      res.json(listCompanies(db, parseQuery(companiesQuerySchema, req.query)));
    }),
  );
  router.post(
    '/companies',
    route((req, res) => {
      const company = createCompany(db, parse(companyCreateSchema, req.body));
      res.status(201).location(`/api/v1/companies/${company.id}`).json(company);
    }),
  );
  router.all('/companies', methodNotAllowed);

  router.get(
    '/companies/duplicates',
    route((req, res) => {
      const query = parseQuery(duplicateCompanyQuerySchema, req.query);
      res.json(checkCompanyDomain(db, query.domain));
    }),
  );

  router.get(
    '/companies/:id',
    route((req, res) => {
      res.json(getCompany(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/companies/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateCompany(db, id, parse(companyUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/companies/:id',
    route((req, res) => {
      deleteCompany(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.all('/companies/:id', methodNotAllowed);

  return router;
}
