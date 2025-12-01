import { useRouter } from 'next/router';
import { Button, Layout, Space } from 'antd';
import styled from 'styled-components';
import LogoBar from '@/components/LogoBar';
import { Path } from '@/utils/enum';
import Deploy from '@/components/deploy/Deploy';
import { ChartPie, Database, SquarePen } from 'lucide-react';

const { Header } = Layout;

const StyledButton = styled(Button)<{ $isHighlight: boolean }>`
  background-color: ${(props) =>
    props.$isHighlight ? 'var(--gray-4)' : 'transparent'};

  cursor: pointer;
  display: flex;
  align-items: center;
  // padding-left: 16px;
  // padding-right: 16px;
  color: var(--gray-8) !important;
  border-radius: 0;

  &:hover,
  &:focus {
    background-color: var(--gray-4);
  }
`;

const StyledHeader = styled(Header)`
  height: auto;
  border-bottom: 1px solid var(--gray-4);
  background: var(--gray-2);
  padding: 10px 8px;
`;

export default function HeaderBar() {
  const router = useRouter();
  const { pathname } = router;
  const showNav = !pathname.startsWith(Path.Onboarding);
  const isModeling = pathname.startsWith(Path.Modeling);

  return (
    <StyledHeader>
      <div className="d-flex flex-column">
        <Space size={[0, 8]} direction="vertical">
          {showNav && (
            <Space size={[0, 4]} direction="vertical" style={{ width: '100%' }}>
              <Space size={[2, 0]} style={{ width: '100%' }}>
                <LogoBar />
                <div className="d-flex flex-column">
                  <h4
                    style={{ color: 'var(--rust-orange-6)', marginBottom: -6 }}
                  >
                    NQR Analytics
                  </h4>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--gray-6)', margin: 0 }}
                  >
                    v1.0.0
                  </p>
                </div>
              </Space>
              <StyledButton
                type="text"
                $isHighlight={pathname === Path.Home}
                onClick={() => router.push(Path.Home)}
                block
              >
                <SquarePen size={16} className="mr-1" />
                New Chat
              </StyledButton>
              <StyledButton
                type="text"
                $isHighlight={pathname.startsWith(Path.HomeDashboard)}
                onClick={() => router.push(Path.HomeDashboard)}
                block
              >
                <ChartPie size={16} className="mr-1" />
                Dashboard
              </StyledButton>
              <StyledButton
                type="text"
                $isHighlight={pathname.startsWith(Path.Modeling)}
                onClick={() => router.push(Path.Modeling)}
                block
              >
                <Database size={16} className="mr-1" />
                Data Source
              </StyledButton>
              {/* <StyledButton
                type="text"
                $isHighlight={pathname.startsWith(Path.Knowledge)}
                onClick={() => router.push(Path.KnowledgeQuestionSQLPairs)}
                block
              >
                Knowledge
              </StyledButton>
              <StyledButton
                type="text"
                $isHighlight={pathname.startsWith(Path.APIManagement)}
                onClick={() => router.push(Path.APIManagementHistory)}
                block
              >
                API Management
              </StyledButton> */}
            </Space>
          )}
        </Space>
        {isModeling && (
          <Space size={[16, 0]}>
            <Deploy />
          </Space>
        )}
      </div>
    </StyledHeader>
  );
}
