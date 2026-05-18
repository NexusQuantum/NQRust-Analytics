import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloneDeep, uniq } from 'lodash';
import { useDocuments } from './useDocuments';
import {
  AdjustmentTask,
  AskingTask,
  AskingTaskStatus,
  AskingTaskType,
  DetailedThread,
  RecommendedQuestionsTask,
  RecommendedQuestionsTaskStatus,
  ThreadResponse,
} from '@/apollo/client/graphql/__types__';
import {
  useAskingTaskLazyQuery,
  useCancelAskingTaskMutation,
  useCreateAskingTaskMutation,
  useRerunAskingTaskMutation,
  useCreateInstantRecommendedQuestionsMutation,
  useInstantRecommendedQuestionsLazyQuery,
} from '@/apollo/client/graphql/home.generated';
import useAskingStreamTask from './useAskingStreamTask';
import { THREAD } from '@/apollo/client/graphql/home';
import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import { nextTick } from '@/utils/time';

export interface AskPromptData {
  originalQuestion: string;
  askingTask?: AskingTask;
  askingStreamTask?: string;
  recommendedQuestions?: RecommendedQuestionsTask;
}

export const getIsFinished = (status: AskingTaskStatus) =>
  [
    AskingTaskStatus.FINISHED,
    AskingTaskStatus.FAILED,
    AskingTaskStatus.STOPPED,
  ].includes(status);

export const canGenerateAnswer = (
  askingTask: AskingTask,
  adjustmentTask: AdjustmentTask,
) =>
  (askingTask === null && adjustmentTask === null) ||
  askingTask?.status === AskingTaskStatus.FINISHED ||
  adjustmentTask?.status === AskingTaskStatus.FINISHED;

export const canFetchThreadResponse = (askingTask: AskingTask) =>
  askingTask !== null &&
  askingTask?.status !== AskingTaskStatus.FAILED &&
  askingTask?.status !== AskingTaskStatus.STOPPED;

export const isReadyToThreadResponse = (askingTask: AskingTask) =>
  askingTask?.status === AskingTaskStatus.SEARCHING &&
  askingTask?.type === AskingTaskType.TEXT_TO_SQL;

export const isRecommendedFinished = (status: RecommendedQuestionsTaskStatus) =>
  [
    RecommendedQuestionsTaskStatus.FINISHED,
    RecommendedQuestionsTaskStatus.FAILED,

    // for existing thread response & existing projects that are not executed to generate recommendation questions
    RecommendedQuestionsTaskStatus.NOT_STARTED,
  ].includes(status);

const isNeedRecommendedQuestions = (askingTask: AskingTask) => {
  const isGeneralOrMisleadingQuery = [
    AskingTaskType.GENERAL,
    AskingTaskType.MISLEADING_QUERY,
  ].includes(askingTask?.type);
  const isFailed =
    askingTask?.type !== AskingTaskType.TEXT_TO_SQL &&
    askingTask?.status === AskingTaskStatus.FAILED;
  return isGeneralOrMisleadingQuery || isFailed;
};

const isNeedPreparing = (askingTask: AskingTask) =>
  askingTask?.type === AskingTaskType.TEXT_TO_SQL;

const handleUpdateThreadCache = (
  threadId: number,
  askingTask: AskingTask,
  client: ApolloClient<NormalizedCacheObject>,
) => {
  if (!askingTask) return;

  const result = client.cache.readQuery<{ thread: DetailedThread }>({
    query: THREAD,
    variables: { threadId },
  });

  if (result?.thread) {
    client.cache.updateQuery(
      {
        query: THREAD,
        variables: { threadId },
      },
      (existingData) => {
        return {
          thread: {
            ...existingData.thread,
            responses: existingData.thread.responses.map((response) => {
              if (response.askingTask?.queryId === askingTask?.queryId) {
                return {
                  ...response,
                  askingTask: cloneDeep(askingTask),
                };
              }
              return response;
            }),
          },
        };
      },
    );
  }
};

const handleUpdateRerunAskingTaskCache = (
  threadId: number,
  threadResponseId: number,
  askingTask: AskingTask,
  client: ApolloClient<NormalizedCacheObject>,
) => {
  if (!askingTask) return;

  const result = client.cache.readQuery<{ thread: DetailedThread }>({
    query: THREAD,
    variables: { threadId },
  });

  if (result?.thread) {
    const task = cloneDeep(askingTask);
    // bypass understanding status to thread response
    if (task.status === AskingTaskStatus.UNDERSTANDING) {
      task.status = AskingTaskStatus.SEARCHING;
      task.type = AskingTaskType.TEXT_TO_SQL;
    }
    client.cache.updateQuery(
      {
        query: THREAD,
        variables: { threadId },
      },
      (existingData) => {
        return {
          thread: {
            ...existingData.thread,
            responses: existingData.thread.responses.map((response) => {
              if (response.id === threadResponseId) {
                return { ...response, askingTask: task };
              }
              return response;
            }),
          },
        };
      },
    );
  }
};

export default function useAskPrompt(threadId?: number) {
  const [originalQuestion, setOriginalQuestion] = useState<string>('');
  const [threadQuestions, setThreadQuestions] = useState<string[]>([]);
  const { selectedIds, documents } = useDocuments();
  // Only pass IDs of indexed (ready) documents
  const indexedSelectedIds = useMemo(
    () => selectedIds.filter((id) => documents.find((d) => d.id === id)?.status === 'indexed'),
    [selectedIds, documents],
  );
  // Handle errors via try/catch blocks rather than onError callback
  const [createAskingTask, createAskingTaskResult] =
    useCreateAskingTaskMutation();
  const [cancelAskingTask] = useCancelAskingTaskMutation({
    onError: (error) => console.error(error),
  });
  const [rerunAskingTask] = useRerunAskingTaskMutation({
    onError: (error) => console.error(error),
  });
  const [fetchAskingTask, askingTaskResult] = useAskingTaskLazyQuery({
    pollInterval: 1000,
  });
  const [fetchAskingStreamTask, askingStreamTaskResult] = useAskingStreamTask();
  const [createInstantRecommendedQuestions] =
    useCreateInstantRecommendedQuestionsMutation({
      onError: (error) => console.error(error),
    });
  const [fetchInstantRecommendedQuestions, instantRecommendedQuestionsResult] =
    useInstantRecommendedQuestionsLazyQuery({
      pollInterval: 1000,
    });

  const askingTask = useMemo(
    () => askingTaskResult.data?.askingTask || null,
    [askingTaskResult.data],
  );
  const askingTaskType = useMemo(() => askingTask?.type, [askingTask?.type]);
  const askingStreamTask = askingStreamTaskResult.data;
  const recommendedQuestions = useMemo(
    () =>
      instantRecommendedQuestionsResult.data?.instantRecommendedQuestions ||
      null,
    [instantRecommendedQuestionsResult.data],
  );

  const loading = askingStreamTaskResult.loading;

  const data = useMemo(
    () => ({
      originalQuestion,
      askingTask,
      askingStreamTask,
      recommendedQuestions,
    }),
    [originalQuestion, askingTask, askingStreamTask, recommendedQuestions],
  );

  const startRecommendedQuestions = useCallback(async () => {
    const previousQuestions = [
      // slice the last 5 questions in threadQuestions
      ...uniq(threadQuestions).slice(-5),
      originalQuestion,
    ];
    const response = await createInstantRecommendedQuestions({
      variables: { data: { previousQuestions } },
    });
    const irqTaskId = response.data?.createInstantRecommendedQuestions?.id;
    if (!irqTaskId) {
      console.error('createInstantRecommendedQuestions returned no id', response);
      return;
    }
    fetchInstantRecommendedQuestions({
      variables: { taskId: irqTaskId },
    });
  }, [originalQuestion]);

  const checkFetchAskingStreamTask = useCallback(
    (task: AskingTask) => {
      if (!askingStreamTask && task.status === AskingTaskStatus.PLANNING) {
        fetchAskingStreamTask(task.queryId);
      }
    },
    [askingStreamTask],
  );

  useEffect(() => {
    const isFinished = getIsFinished(askingTask?.status);
    if (isFinished) askingTaskResult.stopPolling();

    // Also stop polling when the GraphQL poll request itself errors
    // (e.g. a bad/missing taskId). Without this, a stale lazy-query
    // session keeps spamming the server every 1s with the same broken
    // variables — visible as a never-ending stream of red /api/graphql
    // requests in the Network panel.
    if (askingTaskResult.error) {
      askingTaskResult.stopPolling();
    }

    // handle update cache for preparing component
    if (isNeedPreparing(askingTask)) {
      if (threadId) {
        handleUpdateThreadCache(threadId, askingTask, askingTaskResult.client);
        checkFetchAskingStreamTask(askingTask);
      }
    }

  }, [askingTask?.status, askingTaskResult.error, threadId, checkFetchAskingStreamTask]);

  useEffect(() => {
    // handle instant recommended questions
    if (isNeedRecommendedQuestions(askingTask)) {
      startRecommendedQuestions();
    }
  }, [askingTask?.type]);

  useEffect(() => {
    if (isRecommendedFinished(recommendedQuestions?.status))
      instantRecommendedQuestionsResult.stopPolling();
    // Same defensive guard as askingTaskResult above — if the poll query
    // itself errors (e.g. missing/stale $taskId), stop the 1s loop so we
    // don't spam /api/graphql until the page is closed.
    if (instantRecommendedQuestionsResult.error) {
      instantRecommendedQuestionsResult.stopPolling();
    }
  }, [recommendedQuestions, instantRecommendedQuestionsResult.error]);

  useEffect(() => {
    const taskId = createAskingTaskResult.data?.createAskingTask.id;
    if (taskId && askingTaskType === AskingTaskType.GENERAL) {
      fetchAskingStreamTask(taskId);
    }
  }, [askingTaskType, createAskingTaskResult.data]);

  const onStop = async (queryId?: string) => {
    const taskId = queryId || createAskingTaskResult.data?.createAskingTask.id;
    if (taskId) {
      await cancelAskingTask({ variables: { taskId } }).catch((error) =>
        console.error(error),
      );
      // waiting for polling fetching stop
      await nextTick(1000);
    }
  };

  const onReRun = async (threadResponse: ThreadResponse) => {
    askingStreamTaskResult.reset();
    setOriginalQuestion(threadResponse.question);
    try {
      const response = await rerunAskingTask({
        variables: { responseId: threadResponse.id },
      });
      const rerunTaskId = response.data?.rerunAskingTask?.id;
      if (!rerunTaskId) {
        console.error('rerunAskingTask returned no id, skipping poll', response);
        return;
      }
      const { data } = await fetchAskingTask({
        variables: { taskId: rerunTaskId },
      });
      // update the asking task in cache manually
      handleUpdateRerunAskingTaskCache(
        threadId,
        threadResponse.id,
        data.askingTask,
        askingTaskResult.client,
      );
    } catch (error) {
      console.error(error);
    }
  };

  const onSubmit = async (value) => {
    askingStreamTaskResult.reset();
    setOriginalQuestion(value);
    try {
      // Fetch fresh selection from server — local state may be stale if another
      // component (SourcesPanel) updated the selection without our knowledge.
      let freshDocumentIds: string[] = indexedSelectedIds;
      try {
        const [selRes, docsRes] = await Promise.all([
          fetch('/api/v1/documents/selection'),
          fetch('/api/v1/documents'),
        ]);
        if (selRes.ok && docsRes.ok) {
          const selData = await selRes.json();
          const docsData = await docsRes.json();
          const allDocs: Array<{ id: string; status: string }> = docsData.documents || [];
          freshDocumentIds = (selData.documentIds || []).filter(
            (id: string) => allDocs.find((d) => d.id === id)?.status === 'indexed',
          );
        }
      } catch {
        // fall back to cached value
      }

      const response = await createAskingTask({
        variables: {
          data: {
            question: value,
            threadId,
            ...(freshDocumentIds.length > 0 ? { documentIds: freshDocumentIds } : {}),
          },
        },
      });
      const newTaskId = response.data?.createAskingTask?.id;
      if (!newTaskId) {
        // Don't start polling on an undefined taskId — Apollo would
        // spam GraphQLError("$taskId required") at 1Hz until close.
        console.error('createAskingTask returned no id, skipping poll', response);
        return;
      }
      await fetchAskingTask({
        variables: { taskId: newTaskId },
      });
    } catch (error) {
      console.error(error);
    }
  };

  const onFetching = async (queryId: string) => {
    if (!queryId) {
      // Guard against polling firing with an undefined taskId, which would
      // cause Apollo to spam GraphQLError("$taskId required") every second
      // and (in some cases) put useThreadQuery into an error state.
      return;
    }
    await fetchAskingTask({
      variables: { taskId: queryId },
    });
  };

  const onStopPolling = () => askingTaskResult.stopPolling();

  const onStopStreaming = () => askingStreamTaskResult.reset();

  const onStopRecommend = () => instantRecommendedQuestionsResult.stopPolling();

  const onStoreThreadQuestions = (questions: string[]) =>
    setThreadQuestions(questions);

  return {
    data,
    loading,
    onStop,
    onReRun,
    onSubmit,
    onFetching,
    onStopPolling,
    onStopStreaming,
    onStopRecommend,
    onStoreThreadQuestions,
    activeDocumentIds: indexedSelectedIds,
    inputProps: {
      placeholder: threadId
        ? 'Ask follow-up questions to explore your data'
        : 'Ask anything about your data',
    },
  };
}
