import type { Db } from '../db';
import type { SearchResults } from '../../shared/types';
import { likeParam } from './entities';

type Row = Record<string, unknown>;

export function search(db: Db, query: string, limit: number): SearchResults {
  const value = likeParam(query);

  const companiesTotal = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM company
           WHERE workspace_id = 1 AND deleted_at IS NULL
             AND (name_norm LIKE ? ESCAPE '\\' OR domain_norm LIKE ? ESCAPE '\\')`,
        )
        .get(value, value) as Row
    ).total,
  );
  const companies = db
    .prepare(
      `SELECT id, name, domain, industry FROM company
       WHERE workspace_id = 1 AND deleted_at IS NULL
         AND (name_norm LIKE ? ESCAPE '\\' OR domain_norm LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
    .all(value, value, limit) as Row[];

  const contactsTotal = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM contact
           WHERE workspace_id = 1 AND deleted_at IS NULL
             AND (first_name_norm LIKE ? ESCAPE '\\' OR last_name_norm LIKE ? ESCAPE '\\'
                  OR email LIKE ? ESCAPE '\\')`,
        )
        .get(value, value, value) as Row
    ).total,
  );
  const contacts = db
    .prepare(
      `SELECT c.id, TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) AS fullName,
        c.email, comp.id AS companyId, comp.name AS companyName, comp.domain AS companyDomain
       FROM contact c
       LEFT JOIN company comp ON comp.id = c.company_id AND comp.deleted_at IS NULL
       WHERE c.workspace_id = 1 AND c.deleted_at IS NULL
         AND (c.first_name_norm LIKE ? ESCAPE '\\' OR c.last_name_norm LIKE ? ESCAPE '\\'
              OR c.email LIKE ? ESCAPE '\\')
       ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`,
    )
    .all(value, value, value, limit) as Row[];

  const dealsTotal = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM deal d
           LEFT JOIN company comp ON comp.id = d.company_id
           WHERE d.workspace_id = 1 AND d.deleted_at IS NULL
             AND (d.title_norm LIKE ? ESCAPE '\\' OR comp.name_norm LIKE ? ESCAPE '\\')`,
        )
        .get(value, value) as Row
    ).total,
  );
  const deals = db
    .prepare(
      `SELECT d.id, d.title, d.amount_minor AS amountMinor, d.currency, d.status,
        s.id AS stageId, s.name AS stageName, s.position AS stagePosition,
        s.probability AS stageProbability,
        comp.id AS companyId, comp.name AS companyName, comp.domain AS companyDomain
       FROM deal d
       JOIN stage s ON s.id = d.stage_id
       LEFT JOIN company comp ON comp.id = d.company_id AND comp.deleted_at IS NULL
       WHERE d.workspace_id = 1 AND d.deleted_at IS NULL
         AND (d.title_norm LIKE ? ESCAPE '\\' OR comp.name_norm LIKE ? ESCAPE '\\')
       ORDER BY d.updated_at DESC, d.id DESC LIMIT ?`,
    )
    .all(value, value, limit) as Row[];

  const leadsTotal = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM lead
           WHERE workspace_id = 1 AND deleted_at IS NULL
             AND (company_name_norm LIKE ? ESCAPE '\\' OR contact_name_norm LIKE ? ESCAPE '\\'
                  OR email LIKE ? ESCAPE '\\')`,
        )
        .get(value, value, value) as Row
    ).total,
  );
  const leads = db
    .prepare(
      `SELECT id, company_name AS companyName, contact_name AS contactName, status
       FROM lead
       WHERE workspace_id = 1 AND deleted_at IS NULL
         AND (company_name_norm LIKE ? ESCAPE '\\' OR contact_name_norm LIKE ? ESCAPE '\\'
              OR email LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
    .all(value, value, value, limit) as Row[];

  return {
    query,
    companies: {
      total: companiesTotal,
      items: companies.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        domain: (row.domain as string | null) ?? null,
        industry: (row.industry as string | null) ?? null,
      })),
    },
    contacts: {
      total: contactsTotal,
      items: contacts.map((row) => ({
        id: Number(row.id),
        fullName: String(row.fullName),
        email: (row.email as string | null) ?? null,
        company:
          row.companyId == null
            ? null
            : {
                id: Number(row.companyId),
                name: String(row.companyName),
                domain: (row.companyDomain as string | null) ?? null,
              },
      })),
    },
    deals: {
      total: dealsTotal,
      items: deals.map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        amountMinor: Number(row.amountMinor),
        currency: row.currency as SearchResults['deals']['items'][number]['currency'],
        status: row.status as SearchResults['deals']['items'][number]['status'],
        stage: {
          id: Number(row.stageId),
          name: String(row.stageName),
          position: Number(row.stagePosition),
          probability: Number(row.stageProbability),
        },
        company:
          row.companyId == null
            ? null
            : {
                id: Number(row.companyId),
                name: String(row.companyName),
                domain: (row.companyDomain as string | null) ?? null,
              },
      })),
    },
    leads: {
      total: leadsTotal,
      items: leads.map((row) => ({
        id: Number(row.id),
        companyName: String(row.companyName),
        contactName: String(row.contactName),
        status: row.status as SearchResults['leads']['items'][number]['status'],
      })),
    },
  };
}
