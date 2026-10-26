// Schemat Notion z schema/notion-schema.json przełożony na żądania Notion API: definicje pól, formuły, widoki.
// Wspólny dla instalatora (setup.mjs) i migracji (update.mjs). Zero zależności.
// Notion schema (schema/notion-schema.json) translated into Notion API request bodies: properties, formulas, views.

export const loc = (v, lang) => (v && typeof v === 'object' && !Array.isArray(v) ? v[lang] ?? v.pl ?? v.en : v);

// ctx: { lang, names: { db: { role: nazwa } }, options: { 'db.role': { token: nazwa } }, dsIds: { db: id } }
export function optionName(schema, db, role, token, ctx) {
  const saved = ctx.options?.[`${db}.${role}`]?.[token];
  if (saved) return saved;
  const spec = schema.databases[db]?.properties?.[role];
  const o = (spec?.options || []).find((x) => x.token === token || loc(x.name, 'pl') === token);
  return o ? loc(o.name, ctx.lang) : token;
}

const quote = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Podstawia {{p:rola}}, {{o:rola:token}} i {{x:baza.rola}} w wyrażeniu formuły albo w wartości filtra.
export function expand(text, schema, db, ctx) {
  return String(text).replace(/\{\{(p|o|x):([^}]+)\}\}/g, (m, kind, arg) => {
    if (kind === 'p') {
      const n = ctx.names?.[db]?.[arg];
      if (!n) throw new Error(`Brak pola dla roli ${db}.${arg} / missing property for role ${db}.${arg}`);
      return `prop("${quote(n)}")`;
    }
    if (kind === 'o') { const [role, token] = arg.split(':'); return quote(optionName(schema, db, role, token, ctx)); }
    const [odb, orole] = arg.split('.');
    const n = ctx.names?.[odb]?.[orole];
    if (!n) throw new Error(`Brak pola dla roli ${odb}.${orole} / missing property for role ${odb}.${orole}`);
    return quote(n);
  });
}

// Definicja pola do POST /v1/databases (initial_data_source.properties) albo PATCH /v1/data_sources/:id.
export function propertyDef(schema, db, role, ctx) {
  const spec = schema.databases[db].properties[role];
  switch (spec.type) {
    case 'title': return { title: {} };
    case 'rich_text': return { rich_text: {} };
    case 'date': return { date: {} };
    case 'url': return { url: {} };
    case 'files': return { files: {} };
    case 'checkbox': return { checkbox: {} };
    case 'number': return { number: { format: spec.format || 'number' } };
    case 'select': return { select: { options: (spec.options || []).map((o) => ({ name: loc(o.name, ctx.lang), color: o.color || 'default' })) } };
    case 'multi_select': return { multi_select: { options: (spec.options || []).map((o) => ({ name: loc(o.name, ctx.lang), color: o.color || 'default' })) } };
    case 'formula': return { formula: { expression: expand(spec.expression, schema, db, ctx) } };
    case 'rollup': {
      // suma po relacji (API Notion nie przyjmuje w formułach map() po relacji, więc saldo liczy rollup)
      const [tdb, trole] = spec.target.split('.');
      return { rollup: { relation_property_name: ctx.names[db][spec.relation], rollup_property_name: ctx.names[tdb][trole], function: spec.function || 'sum' } };
    }
    case 'relation': {
      if (!spec.to) throw new Error(`Relacja ${db}.${role} powstaje po drugiej stronie / synced relation is created from the other side`);
      const target = ctx.dsIds?.[spec.to];
      if (!target) throw new Error(`Brak bazy docelowej ${spec.to} / missing target database ${spec.to}`);
      return spec.syncedRole
        ? { relation: { data_source_id: target, type: 'dual_property', dual_property: {} } }
        : { relation: { data_source_id: target, type: 'single_property', single_property: {} } };
    }
    default: throw new Error(`Nieobsługiwany typ pola ${spec.type}`);
  }
}

// Treść POST /v1/views dla widoku ze schematu. ids: { db: dbId, ds: dsId, props: { rola: id } }
export function viewBody(schema, db, view, ctx, ids) {
  const body = { database_id: ids.db, data_source_id: ids.ds, name: loc(view.name, ctx.lang), type: view.type };
  const pname = (role) => {
    const n = ctx.names?.[db]?.[role];
    if (!n) throw new Error(`Brak pola dla roli ${db}.${role}`);
    return n;
  };
  if (view.filter) {
    const { role, ...cond } = view.filter;
    body.filter = { property: pname(role), ...JSON.parse(expand(JSON.stringify(cond), schema, db, ctx)) };
  }
  if (view.sorts) body.sorts = view.sorts.map((s) => ({ property: pname(s.role), direction: s.direction }));
  if (view.type === 'calendar' && view.dateRole) body.configuration = { type: 'calendar', date_property_id: ids.props[view.dateRole], view_range: 'month', show_weekends: true };
  if (view.type === 'gallery' && view.coverRole) body.configuration = { type: 'gallery', cover: { type: 'property', property_id: ids.props[view.coverRole] }, cover_size: 'large', cover_aspect: 'contain' };
  return body;
}

// Pola tworzone razem z bazą: wszystko poza relacjami zwrotnymi (powstają same) i formułami (po relacjach, osobnym PATCH).
export function initialRoles(schema, db) {
  return Object.entries(schema.databases[db].properties).filter(([, s]) => !s.synced && s.type !== 'formula' && s.type !== 'rollup').map(([r]) => r);
}
// pola liczone po relacjach: najpierw rollupy, potem formuły (formuła może korzystać z rollupu)
export function formulaRoles(schema, db) {
  const e = Object.entries(schema.databases[db].properties);
  return [...e.filter(([, s]) => s.type === 'rollup'), ...e.filter(([, s]) => s.type === 'formula')].map(([r]) => r);
}
