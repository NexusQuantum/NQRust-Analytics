import { useEffect, useRef, useState } from 'react';
import { Input, Button } from 'antd';
import styled from 'styled-components';
import { attachLoading } from '@/utils/helper';
import { SendHorizontal } from 'lucide-react';

const StyledTextArea = styled(Input.TextArea)`
  border: none !important;
  box-shadow: none !important;
  width: 100% !important;

  &:focus,
  &:hover {
    border: none !important;
    box-shadow: none !important;
  }
`;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

interface Props {
  question: string;
  isProcessing: boolean;
  onAsk: (value: string) => Promise<void>;
  inputProps: {
    placeholder?: string;
  };
}

export default function PromptInput(props: Props) {
  const { onAsk, isProcessing, question, inputProps } = props;
  const $promptInput = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [innerLoading, setInnerLoading] = useState(false);

  useEffect(() => {
    if (question) setInputValue(question);
  }, [question]);

  useEffect(() => {
    if (!isProcessing) {
      $promptInput.current?.focus();
      setInputValue('');
    }
  }, [isProcessing]);

  const syncInputValue = (event) => {
    setInputValue(event.target.value);
  };

  const handleAsk = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) return;
    const startAsking = attachLoading(onAsk, setInnerLoading);
    startAsking(trimmedValue);
  };

  const inputEnter = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.shiftKey) return;
    event.preventDefault();
    handleAsk();
  };

  const isDisabled = innerLoading || isProcessing;

  return (
    <Wrapper>
      <StyledTextArea
        ref={$promptInput}
        // disable grammarly
        data-gramm="false"
        size="large"
        autoSize
        value={inputValue}
        onInput={syncInputValue}
        onPressEnter={inputEnter}
        disabled={isDisabled}
        {...inputProps}
      />
      <div className="d-flex align-center justify-space-between">
        <div className="d-flex gap-2">
          {/* <Button
            type="text"
            className="d-flex align-center justify-center"
            icon={<Paperclip size={16} />}
            onClick={() => console.log('click')}
            disabled={isDisabled}
          />

          <Button
            type="text"
            className="d-flex align-center justify-center"
            icon={<Database size={16} className="mr-1" />}
            disabled={isDisabled}
          >
            Source
          </Button> */}
        </div>
        <Button
          type="primary"
          size="large"
          className="d-flex align-center justify-center"
          icon={<SendHorizontal />}
          onClick={handleAsk}
          disabled={isDisabled}
        />
      </div>
    </Wrapper>
  );
}
