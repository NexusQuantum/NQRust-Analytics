/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('thread_response', (table) => {
    table
      .jsonb('document_answer_detail')
      .nullable()
      .comment('Document RAG answer detail: content, citations, retrieved_document_ids');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('thread_response', (table) => {
    table.dropColumn('document_answer_detail');
  });
};
