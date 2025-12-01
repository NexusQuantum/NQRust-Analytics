import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect } from 'react';
import styled from 'styled-components';
import {
  Alert,
  Button,
  Divider,
  Empty,
  message,
  Space,
  Switch,
  Typography,
} from 'antd';
import { Code, View } from 'lucide-react';
import { nextTick } from '@/utils/time';
import useNativeSQL from '@/hooks/useNativeSQL';
import { DATA_SOURCE_OPTIONS } from '@/components/pages/setup/utils';
import { Logo } from '@/components/Logo';
import { Props as AnswerResultProps } from '@/components/pages/home/promptThread/AnswerResult';
import usePromptThreadStore from '@/components/pages/home/promptThread/store';
import PreviewData from '@/components/dataPreview/PreviewData';
import { usePreviewDataMutation } from '@/apollo/client/graphql/home.generated';

const SQLCodeBlock = dynamic(() => import('@/components/code/SQLCodeBlock'), {
  ssr: false,
});

const { Text } = Typography;

const StyledPre = styled.pre`
  .adm_code-block {
    border-top: none;
    border-radius: 0px 0px 4px 4px;
  }
`;

const StyledToolBar = styled.div`
  background-color: var(--gray-2);
  height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--gray-3);
  border-radius: 4px 4px 0px 0px;
`;

export default function ViewSQLTabContent(props: AnswerResultProps) {
  const { isLastThreadResponse, onInitPreviewDone, threadResponse } = props;

  const { onOpenAdjustSQLModal } = usePromptThreadStore();
  const { fetchNativeSQL, nativeSQLResult } = useNativeSQL();
  const [previewData, previewDataResult] = usePreviewDataMutation({
    onError: (error) => console.error(error),
  });

  const onPreviewData = async () => {
    await previewData({ variables: { where: { responseId: id } } });
  };

  const autoTriggerPreviewDataButton = async () => {
    await nextTick();
    await onPreviewData();
    await nextTick();
    onInitPreviewDone();
  };

  // when is the last step of the last thread response, auto trigger preview data button
  useEffect(() => {
    if (isLastThreadResponse) {
      autoTriggerPreviewDataButton();
    }
  }, [isLastThreadResponse]);

  const { id, sql } = threadResponse;

  const { hasNativeSQL, dataSourceType } = nativeSQLResult;
  const showNativeSQL = hasNativeSQL;

  // fetch native SQL on initial load to show original SQL by default (switch inactive)
  useEffect(() => {
    if (
      showNativeSQL &&
      !nativeSQLResult.nativeSQLMode &&
      !nativeSQLResult.data
    ) {
      fetchNativeSQL({ variables: { responseId: id } });
    }
  }, [
    showNativeSQL,
    id,
    nativeSQLResult.nativeSQLMode,
    nativeSQLResult.data,
    fetchNativeSQL,
  ]);

  const sqls =
    nativeSQLResult.nativeSQLMode && nativeSQLResult.loading === false
      ? sql
      : nativeSQLResult.data || sql;

  const onChangeNativeSQL = async (checked: boolean) => {
    nativeSQLResult.setNativeSQLMode(checked);
    !checked && fetchNativeSQL({ variables: { responseId: id } });
  };

  const onCopy = () => {
    if (nativeSQLResult.nativeSQLMode) {
      message.success(
        <>
          You copied NQRust SQL. This dialect is for the NQRust Engine and may
          not run directly on your database.
          {hasNativeSQL && (
            <>
              {' '}
              Click "<b>Show original SQL</b>" to get the executable version.
            </>
          )}
        </>,
      );
    }
  };

  return (
    <div className="text-md gray-10">
      <Alert
        className="mb-3 rounded-md"
        type="info"
        message={
          <>
            The original SQL is displayed by default. To view the NQRust SQL
            format, use the toggle above.
            <Typography.Link
              className="underline ml-1"
              href="https://docs.getanalytics.ai/oss/guide/home/analytics_sql"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about NQRust SQL
            </Typography.Link>
          </>
        }
      />
      <StyledPre className="p-0 mb-3">
        <StyledToolBar className="d-flex align-center justify-space-between text-family-base">
          <div>
            {nativeSQLResult.nativeSQLMode ? (
              <span className="d-flex align-center gx-2">
                <Logo size={18} />
                <Text className="gray-8 text-medium text-sm">NQRust SQL</Text>
              </span>
            ) : (
              <>
                <Image
                  className="mr-2"
                  src={DATA_SOURCE_OPTIONS[dataSourceType].logo}
                  alt={DATA_SOURCE_OPTIONS[dataSourceType].label}
                  width="22"
                  height="22"
                />
                <Text className="gray-8 text-medium text-sm">
                  {DATA_SOURCE_OPTIONS[dataSourceType].label}
                </Text>
              </>
            )}
          </div>
          <Space split={<Divider type="vertical" className="m-0" />}>
            {showNativeSQL && (
              <div className="d-flex align-center cursor-pointer">
                <Switch
                  className="mr-2"
                  size="small"
                  checked={nativeSQLResult.nativeSQLMode}
                  loading={nativeSQLResult.loading}
                  onChange={(checked) => onChangeNativeSQL(checked)}
                />
                <Text className="gray-8 text-medium text-base">
                  Show NQRust SQL
                </Text>
              </div>
            )}
            <Button
              type="link"
              className="d-flex align-center"
              data-ph-capture="true"
              data-ph-capture-attribute-name="view_sql_copy_sql"
              icon={<Code size={16} className="mr-1" />}
              size="small"
              onClick={() => onOpenAdjustSQLModal({ sql, responseId: id })}
            >
              Adjust SQL
            </Button>
          </Space>
        </StyledToolBar>
        <SQLCodeBlock
          code={sqls}
          showLineNumbers
          maxHeight="300"
          loading={nativeSQLResult.loading}
          copyable
          onCopy={onCopy}
        />
      </StyledPre>
      <div className="mt-6">
        <Button
          size="small"
          className="d-flex align-center"
          icon={<View size={16} className="mr-1" />}
          loading={previewDataResult.loading}
          onClick={onPreviewData}
          data-ph-capture="true"
          data-ph-capture-attribute-name="view_sql_preview_data"
        >
          View results
        </Button>
        {previewDataResult?.data?.previewData && (
          <div className="mt-2 mb-3">
            <PreviewData
              error={previewDataResult.error}
              loading={previewDataResult.loading}
              previewData={previewDataResult?.data?.previewData}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Sorry, we couldn't find any records that match your search criteria."
                  />
                ),
              }}
            />
            <div className="text-right">
              <Text className="text-base gray-6">Showing up to 500 rows</Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
