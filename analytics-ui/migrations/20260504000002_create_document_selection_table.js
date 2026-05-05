/**
 * Migration to create document_selection table.
 *
 * Tracks which documents are checked (selected as context) per user
 * per notebook. Persistent across sessions, NotebookLM-style.
 *
 * Composite primary key on (notebook_id, document_id, user_id) ensures
 * one selection record per user-doc pair. Both notebook_id and
 * document_id are kept (denormalized) for efficient filtering by notebook
 * without a join.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('document_selection', (table) => {
    table
      .integer('notebook_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('notebook')
      .onDelete('CASCADE');
    table
      .integer('document_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('document')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('user')
      .onDelete('CASCADE');
    table
      .boolean('selected')
      .notNullable()
      .defaultTo(false)
      .comment('Whether the document is checked as active context');
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.primary(['notebook_id', 'document_id', 'user_id']);
    table.index(['notebook_id', 'user_id']);
    table.index(['notebook_id', 'user_id', 'selected']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('document_selection');
};
