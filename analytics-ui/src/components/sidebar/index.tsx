// import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from 'antd';
import styled from 'styled-components';
import { Path } from '@/utils/enum';
// import { DiscordIcon, GithubIcon } from '@/utils/icons';
import { Settings } from 'lucide-react';
import Home, { Props as HomeSidebarProps } from './Home';
import Modeling, { Props as ModelingSidebarProps } from './Modeling';
import Knowledge from './Knowledge';
import APIManagement from './APIManagement';
import HeaderBar from '@/components/HeaderBar';
import UserMenu from '@/components/UserMenu';
import SourcesPanel from '@/components/sources/SourcesPanel';
import { useNotebookContext } from '@/hooks/useNotebookContext';
// import LearningSection from '@/components/learning';

const Layout = styled.div`
  position: relative;
  height: 100%;
  background-color: var(--gray-2);
  color: var(--gray-8);
  overflow-x: hidden;
  overflow-y: hidden;
`;

const Content = styled.div<{ $noScroll?: boolean }>`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: ${(p) => (p.$noScroll ? 'hidden' : 'auto')};
  padding-left: 8px;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
`;

const StyledButton = styled(Button)`
  cursor: pointer;
  display: flex;
  align-items: center;
  padding-left: 16px;
  padding-right: 16px;
  color: var(--gray-8) !important;
  border-radius: 8px;

  &:hover,
  &:focus {
    background-color: var(--gray-4);
  }
`;

type Props = (ModelingSidebarProps | HomeSidebarProps) & {
  onOpenSettings?: () => void;
};

const DynamicSidebar = (
  props: Props & {
    pathname: string;
  },
) => {
  const { pathname, ...restProps } = props;

  const getContent = () => {
    if (pathname.startsWith(Path.Home)) {
      return <Home {...(restProps as HomeSidebarProps)} />;
    }

    if (pathname.startsWith(Path.Modeling)) {
      return <Modeling {...(restProps as ModelingSidebarProps)} />;
    }

    if (pathname.startsWith(Path.Knowledge)) {
      return <Knowledge />;
    }

    if (pathname.startsWith(Path.APIManagement)) {
      return <APIManagement />;
    }

    return null;
  };

  const isHome = pathname.startsWith(Path.Home);
  return <Content $noScroll={isHome}>{getContent()}</Content>;
};

export default function Sidebar(props: Props) {
  const { onOpenSettings } = props;
  const router = useRouter();

  const onSettingsClick = (event) => {
    onOpenSettings && onOpenSettings();
    event.target.blur();
  };

  const isHome = router.pathname.startsWith(Path.Home);
  const { notebookId, setSelectedDocumentIds } = useNotebookContext();

  return (
    <Layout className="d-flex flex-column border-r border-gray-4">
      <HeaderBar />

      <DynamicSidebar {...props} pathname={router.pathname} />
      {isHome && (
        <SourcesPanel
          embedded
          notebookId={notebookId}
          onSelectionChange={setSelectedDocumentIds}
        />
      )}
      {/* <LearningSection /> */}
      <div className="border-t border-gray-4 p-2">
        <UserMenu />
        <StyledButton type="text" block onClick={onSettingsClick}>
          <Settings className="mr-1" size={16} />
          Settings
        </StyledButton>
        {/* <StyledButton type="text" block>
          <Link
            className="d-flex align-center"
            href="https://discord.com/invite/5DvshJqG8Z"
            target="_blank"
            rel="noopener noreferrer"
            data-ph-capture="true"
            data-ph-capture-attribute-name="cta_go_to_discord"
          >
            <DiscordIcon className="mr-2" style={{ width: 16 }} /> Discord
          </Link>
        </StyledButton>
        <StyledButton type="text" block>
          <Link
            className="d-flex align-center"
            href="https://github.com/NexusQuantum/NQRust-Analytics"
            target="_blank"
            rel="noopener noreferrer"
            data-ph-capture="true"
            data-ph-capture-attribute-name="cta_go_to_github"
          >
            <GithubIcon className="mr-2" style={{ width: 16 }} /> GitHub
          </Link>
        </StyledButton> */}
      </div>
    </Layout>
  );
}
