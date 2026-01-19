import { Button, Tooltip, Typography } from 'antd';
import styled from 'styled-components';
import { MoreIcon } from '@/utils/icons';
import { MORE_ACTION } from '@/utils/enum';
import { getCompactTime } from '@/utils/time';
import { DashboardDropdown } from '@/components/diagram/CustomDropdown';
import {
  Schedule,
  getScheduleText,
} from '@/components/pages/home/dashboardGrid/CacheSettingsDrawer';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';

const { Title, Text } = Typography;

interface Props {
  dashboardName?: string;
  dashboardDescription?: string;
  isOwner?: boolean;
  isSupportCached: boolean;
  nextScheduleTime?: string;
  schedule?: Schedule;
  onCacheSettings?: () => void;
  onRefreshAll?: () => void;
  onShare?: () => void;
}

const StyledHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 49px;
  padding: 8px 16px;
  background-color: white;
  border-bottom: 1px solid var(--gray-4);
`;

const DashboardInfo = styled.div`
  display: flex;
  flex-direction: column;
  
  .dashboard-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #262626;
  }
  
  .dashboard-description {
    font-size: 12px;
    color: #8c8c8c;
    margin-top: 2px;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export default function DashboardHeader(props: Props) {
  const {
    dashboardName,
    dashboardDescription,
    isOwner,
    isSupportCached,
    nextScheduleTime,
    schedule,
    onCacheSettings,
    onRefreshAll,
    onShare,
  } = props;

  const scheduleTime = getScheduleText(schedule);

  const onMoreClick = async (action: MORE_ACTION) => {
    if (action === MORE_ACTION.CACHE_SETTINGS) {
      onCacheSettings?.();
    } else if (action === MORE_ACTION.REFRESH) {
      onRefreshAll?.();
    }
  };

  return (
    <StyledHeader>
      <DashboardInfo>
        {dashboardName ? (
          <>
            <Title level={5} className="dashboard-title">{dashboardName}</Title>
            {dashboardDescription && (
              <Text className="dashboard-description">{dashboardDescription}</Text>
            )}
          </>
        ) : (
          <Title level={5} className="dashboard-title">Dashboard</Title>
        )}
      </DashboardInfo>
      <HeaderActions>
        {isOwner && onShare && (
          <Tooltip title="Share Dashboard">
            <Button
              type="text"
              icon={<ShareAltOutlined />}
              onClick={onShare}
            />
          </Tooltip>
        )}
        {schedule && (
          <div className="d-flex align-center gray-6 gx-2">
            {isSupportCached && (
              <>
                {nextScheduleTime ? (
                  <Tooltip
                    placement="bottom"
                    title={
                      <>
                        <div>
                          <span className="gray-6">Next schedule:</span>{' '}
                          {getCompactTime(nextScheduleTime)}
                        </div>
                        {schedule.cron && (
                          <div>
                            <span className="gray-6">Cron expression:</span>{' '}
                            {schedule.cron}
                          </div>
                        )}
                      </>
                    }
                  >
                    <span className="cursor-pointer">{scheduleTime}</span>
                  </Tooltip>
                ) : (
                  scheduleTime
                )}
              </>
            )}
            <DashboardDropdown
              onMoreClick={onMoreClick}
              isSupportCached={isSupportCached}
            >
              <Button type="text" icon={<MoreIcon className="gray-8" />} />
            </DashboardDropdown>
          </div>
        )}
      </HeaderActions>
    </StyledHeader>
  );
}
