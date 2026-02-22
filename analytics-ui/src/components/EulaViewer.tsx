import { useState } from 'react';
import { Radio } from 'antd';
import styled from 'styled-components';
import { EULA_EN, EULA_ID } from '@/constants/eulaContent';

type EulaLanguage = 'en' | 'id';

interface EulaViewerProps {
  maxHeight?: number | string;
}

const ScrollContainer = styled.div<{ $maxHeight: string | number }>`
  max-height: ${(p) =>
    typeof p.$maxHeight === 'number' ? `${p.$maxHeight}px` : p.$maxHeight};
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 20px;
  background: #fafafa;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.7;
  color: #262626;
`;

export default function EulaViewer({ maxHeight = 400 }: EulaViewerProps) {
  const [language, setLanguage] = useState<EulaLanguage>('en');

  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Radio.Group
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="en">English</Radio.Button>
          <Radio.Button value="id">Bahasa Indonesia</Radio.Button>
        </Radio.Group>
      </div>
      <ScrollContainer $maxHeight={maxHeight}>
        {language === 'en' ? EULA_EN : EULA_ID}
      </ScrollContainer>
    </div>
  );
}
