// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
if (process.env.DB_TYPE === 'pg') {
  console.log('Using Postgres');
  module.exports = {
    client: 'pg',
    connection: process.env.PG_URL,
  };
} else {
  console.log('Using SQLite');
  module.exports = {
    client: 'better-sqlite3',
    connection: process.env.SQLITE_FILE || './db.sqlite3',
    useNullAsDefault: true,
    // SQLite ships with foreign keys disabled per connection. The folder
    // schema relies on ON DELETE CASCADE / SET NULL, so enable them on
    // every pool checkout — otherwise deletes silently leave orphans.
    pool: {
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
  };
}
