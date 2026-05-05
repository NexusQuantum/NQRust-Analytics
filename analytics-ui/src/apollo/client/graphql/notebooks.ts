import { gql } from '@apollo/client';

const NOTEBOOK = gql`
  fragment Notebook on Notebook {
    id
    projectId
    name
    documentCount
    createdAt
  }
`;

const DOCUMENT = gql`
  fragment Document on Document {
    id
    notebookId
    filename
    mimeType
    size
    pageCount
    status
    errorMessage
    selected
    createdAt
  }
`;

export const LIST_NOTEBOOKS = gql`
  query Notebooks($projectId: ID!) {
    notebooks(projectId: $projectId) {
      ...Notebook
    }
  }
  ${NOTEBOOK}
`;

export const CREATE_NOTEBOOK = gql`
  mutation CreateNotebook($input: CreateNotebookInput!) {
    createNotebook(input: $input) {
      ...Notebook
    }
  }
  ${NOTEBOOK}
`;

export const RENAME_NOTEBOOK = gql`
  mutation RenameNotebook($id: ID!, $name: String!) {
    renameNotebook(id: $id, name: $name) {
      ...Notebook
    }
  }
  ${NOTEBOOK}
`;

export const DELETE_NOTEBOOK = gql`
  mutation DeleteNotebook($id: ID!) {
    deleteNotebook(id: $id)
  }
`;

export const LIST_DOCUMENTS = gql`
  query Documents($notebookId: ID!) {
    documents(notebookId: $notebookId) {
      ...Document
    }
  }
  ${DOCUMENT}
`;

export const TOGGLE_DOCUMENT_SELECTION = gql`
  mutation ToggleDocumentSelection($documentId: ID!, $selected: Boolean!) {
    toggleDocumentSelection(documentId: $documentId, selected: $selected) {
      ...Document
    }
  }
  ${DOCUMENT}
`;

export const DELETE_DOCUMENT = gql`
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;
