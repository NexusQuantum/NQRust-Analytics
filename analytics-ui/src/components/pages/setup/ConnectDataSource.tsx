import Image from 'next/image';
import Link from 'next/link';
import { Alert, Typography, Form, Row, Col, Button } from 'antd';
import styled from 'styled-components';
import { DATA_SOURCES } from '@/utils/enum/dataSources';
import { getDataSource, getPostgresErrorMessage } from './utils';

const StyledForm = styled(Form)`
  margin: 24px 0px;
`;

const DataSource = styled.div`
  margin-bottom: 24px;
`;

interface Props {
  dataSource: DATA_SOURCES;
  onNext: (data: any) => void;
  onBack: () => void;
  submitting: boolean;
  connectError?: Record<string, any>;
}

export default function ConnectDataSource(props: Props) {
  const { connectError, dataSource, submitting, onNext, onBack } = props;
  const [form] = Form.useForm();
  const current = getDataSource(dataSource);

  const submit = () => {
    form
      .validateFields()
      .then((values) => {
        onNext && onNext({ properties: values });
      })
      .catch((error) => {
        console.error(error);
      });
  };

  return (
    <>
      {/* <Typography.Title level={1} className="mb-0">
        Connect your data source
      </Typography.Title> */}

      <StyledForm form={form} layout="vertical">
        <DataSource>
          <Image
            className="mr-2"
            src={current.logo}
            alt={dataSource}
            width="64"
            height="64"
          />
          <div>
            <Typography.Title level={3} className="mb-0">
              {current.label}
            </Typography.Title>
            <Typography.Text type="secondary">
              Learn more information in the {current.label}{' '}
              <Link
                href={current.guide}
                target="_blank"
                rel="noopener noreferrer"
              >
                setup guide
              </Link>
              .
            </Typography.Text>
          </div>
        </DataSource>
        <current.component />
      </StyledForm>

      {connectError && (
        <Alert
          message={connectError.shortMessage}
          description={
            dataSource === DATA_SOURCES.POSTGRES
              ? getPostgresErrorMessage(connectError)
              : connectError.message
          }
          type="error"
          showIcon
          className="my-6"
        />
      )}

      <Row gutter={16} className="pt-6">
        <Col span={12}>
          <Button
            onClick={onBack}
            size="large"
            className="adm-onboarding-btn"
            disabled={submitting}
          >
            Back
          </Button>
        </Col>
        <Col className="text-right" span={12}>
          <Button
            type="primary"
            size="large"
            onClick={submit}
            loading={submitting}
            className="adm-onboarding-btn"
          >
            Next
          </Button>
        </Col>
      </Row>
    </>
  );
}
