/**
 * Migration to create notebook table.
 *
 * A notebook is a container for documents, scoped to a project.
 * Users can chat against the project's database with documents in a
 * notebook providing additional context (NotebookLM-style).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('notebook', (table) => {
    table.increments('id').primary();
    table
      .integer('project_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('project')
      .onDelete('CASCADE')
      .comment('Project the notebook belongs to');
    table.string('name').notNullable().comment('Notebook display name');
    table
      .integer('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('user')
      .onDelete('SET NULL')
      .comment('User who created the notebook');
    table.timestamps(true, true);

    table.index(['project_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('notebook');
};
