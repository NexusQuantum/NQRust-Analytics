import { ComponentProps } from 'react';
import { Typography, Row, Col } from 'antd';
import { getDataSources } from './utils';
import { makeIterable } from '@/utils/iteration';
import ButtonItem from './ButtonItem';
import {
  DataSourceName,
} from '@/apollo/client/graphql/__types__';

const { Title, Text } = Typography;

const ButtonTemplate = (props: ComponentProps<typeof ButtonItem>) => {
  return (
    <Col span={4} key={props.label}>
      <ButtonItem {...props} />
    </Col>
  );
};

const DataSourceIterator = makeIterable(ButtonTemplate);

export default function Starter(props) {
  const { onNext, submitting } = props;

  const dataSources = getDataSources();

  const onSelectDataSource = (value: DataSourceName) => {
    onNext && onNext({ dataSource: value });
  };

  return (
    <>
      <Title level={2} className="mb-0">
        Choose your data source
      </Title>
      <Text type="secondary">
        Start by connecting your own data source. Analytics supports PostgreSQL,
        MySQL, SQL Server, and more. You can also explore using example datasets
        to get started.
      </Text>
      <Row className="mt-6" gutter={[8, 8]}>
        <DataSourceIterator
          data={dataSources}
          onSelect={onSelectDataSource}
          submitting={submitting}
        />
      </Row>

      {/* <div className="py-6" />

      <Typography.Title level={4} className="mb-0">
        Explore using example datasets
      </Typography.Title>
      <Row className="mt-3" gutter={[8, 8]}>
        <TemplatesIterator
          data={templates}
          onSelect={onSelectTemplate}
          submitting={submitting}
          selectedTemplate={template}
        /> 
      </Row> */}
    </>
  );
}
