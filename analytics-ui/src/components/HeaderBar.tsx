import { useRouter } from 'next/router';
import { Button, Layout, Space } from 'antd';
import styled from 'styled-components';
import LogoBar from '@/components/LogoBar';
import { Path } from '@/utils/enum';
import Deploy from '@/components/deploy/Deploy';
import { ChartPie, Database, SquarePen } from 'lucide-react';

const { Header } = Layout;

const StyledButton = styled(Button) <{ $isHighlight: boolean }>`
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
              <Space size={[12, 0]} style={{ width: '100%' }}>
                <LogoBar />
                <div className="d-flex flex-column justify-center">
                  <h3
                    style={{
                      color: 'var(--cimb-red-6)',
                      marginBottom: -4,
                      marginTop: 0,
                      fontWeight: 700,
                      fontSize: '18px',
                      fontFamily: 'Helvetica Neue, sans-serif',
                      lineHeight: 1.2,
                    }}
                  >
                    CIMB Analytics
                  </h3>
                  <p
                    style={{
                      color: 'var(--gray-10)',
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 500,
                      lineHeight: 1.2,
                    }}
                  >
                    Text to SQL
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
