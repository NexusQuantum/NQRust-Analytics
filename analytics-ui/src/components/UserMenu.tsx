import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAuth } from '@/hooks/useAuth';
import useModalAction from '@/hooks/useModalAction';
import ProfileModal from '@/components/ProfileModal';
import UserManagementModal from '@/components/UserManagementModal';

const Container = styled.div`
    position: relative;
`;

const UserButton = styled.div`
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 8px;
    transition: background-color 0.2s;

    &:hover {
        background-color: var(--gray-4);
    }
`;

const Avatar = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background-color: #ff6b35;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
`;

const UserInfo = styled.div`
    margin-left: 10px;
    overflow: hidden;
`;

const UserName = styled.div`
    font-weight: 500;
    color: var(--gray-9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
    font-size: 14px;
`;

const UserEmail = styled.div`
    font-size: 12px;
    color: var(--gray-6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
`;

const MenuDropdown = styled.div<{ isOpen: boolean }>`
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 8px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08);
    padding: 4px 0;
    display: ${props => props.isOpen ? 'block' : 'none'};
    z-index: 1000;
`;

const MenuItem = styled.div`
    display: flex;
    align-items: center;
    padding: 10px 16px;
    cursor: pointer;
    transition: background-color 0.2s;
    color: #262626;
    font-size: 14px;

    &:hover {
        background-color: #f5f5f5;
    }

    svg {
        margin-right: 8px;
        width: 16px;
        height: 16px;
    }
`;

const MenuItemDanger = styled(MenuItem)`
    color: #ff4d4f;
    
    &:hover {
        background-color: #fff1f0;
    }
`;

const MenuDivider = styled.div`
    height: 1px;
    background-color: #f0f0f0;
    margin: 4px 0;
`;

// Simple SVG icons
const UserIcon = () => (
    <svg viewBox="64 64 896 896" fill="currentColor">
        <path d="M858.5 763.6a374 374 0 00-80.6-119.5 375.63 375.63 0 00-119.5-80.6c-.4-.2-.8-.3-1.2-.5C719.5 518 760 444.7 760 362c0-137-111-248-248-248S264 225 264 362c0 82.7 40.5 156 102.8 201.1-.4.2-.8.3-1.2.5-44.8 18.9-85 46-119.5 80.6a375.63 375.63 0 00-80.6 119.5A371.7 371.7 0 00136 901.8a8 8 0 008 8.2h60c4.4 0 7.9-3.5 8-7.8 2-77.2 33-149.5 87.8-204.3 56.7-56.7 132-87.9 212.2-87.9s155.5 31.2 212.2 87.9C779 752.7 810 825 812 901.8c.1 4.4 3.6 7.9 8 7.9h60a8 8 0 008-8.2c-1-47.8-10.9-94.3-29.5-138.2zM512 534c-45.9 0-89.1-17.9-121.6-50.4S340 407.9 340 362c0-45.9 17.9-89.1 50.4-121.6S466.1 190 512 190s89.1 17.9 121.6 50.4S684 316.1 684 362c0 45.9-17.9 89.1-50.4 121.6S557.9 534 512 534z"></path>
    </svg>
);

const UsersIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
);

const LogoutIcon = () => (
    <svg viewBox="64 64 896 896" fill="currentColor">
        <path d="M868 732h-70.3c-4.8 0-9.3 2.1-12.3 5.8-7.9 9.7-16.4 18.9-25.5 27.5a348.33 348.33 0 01-112.1 75.8c-43.5 18.4-89.7 27.8-137.3 27.8s-93.8-9.4-137.3-27.8a348.33 348.33 0 01-112.1-75.8c-31.5-31.5-56.6-68.2-74.8-109.2A342.77 342.77 0 01156 503.5c0-47.8 9.4-94.2 27.8-137.8 18.2-41 43.3-77.8 74.8-109.3 31.5-31.5 68.2-56.6 109.2-74.8 43.6-18.4 90-27.8 137.7-27.8 47.7 0 93.8 9.4 137.3 27.8 41 18.2 77.8 43.3 109.2 74.8 8.9 8.9 17.4 18.1 25.4 27.7 3.1 3.7 7.6 5.8 12.3 5.8H868c6.3 0 10.2-7 6.7-12.3C798 160.5 663.8 81.6 511.3 82 271.7 82.6 79.6 277.1 82 516.4 84.4 751.9 276.2 942 512.4 942c152.1 0 285.7-78.8 362.3-197.7 3.4-5.3-.4-12.3-6.7-12.3zm88.9-226.3L815 393.7c-5.3-4.2-13-.4-13 6.3v76H488c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h314v76c0 6.7 7.8 10.5 13 6.3l141.9-112a8 8 0 000-12.6z"></path>
    </svg>
);

export default function UserMenu() {
    const { user, logout, isAdmin } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const profileModal = useModalAction();
    const userManagementModal = useModalAction();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) {
        return null;
    }

    const handleLogout = async () => {
        setIsOpen(false);
        await logout();
        window.location.href = '/login';
    };

    const handleOpenProfile = () => {
        setIsOpen(false);
        profileModal.openModal();
    };

    const handleOpenUserManagement = () => {
        setIsOpen(false);
        userManagementModal.openModal();
    };

    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    const initials = displayName.charAt(0).toUpperCase();

    return (
        <>
            <Container ref={containerRef}>
                <MenuDropdown isOpen={isOpen}>
                    <MenuItem onClick={handleOpenProfile}>
                        <UserIcon />
                        Profile Settings
                    </MenuItem>
                    {isAdmin() && (
                        <MenuItem onClick={handleOpenUserManagement}>
                            <UsersIcon />
                            User Management
                        </MenuItem>
                    )}
                    <MenuDivider />
                    <MenuItemDanger onClick={handleLogout}>
                        <LogoutIcon />
                        Sign Out
                    </MenuItemDanger>
                </MenuDropdown>
                <UserButton onClick={() => setIsOpen(!isOpen)}>
                    <Avatar>{initials}</Avatar>
                    <UserInfo>
                        <UserName>{displayName}</UserName>
                        <UserEmail>{user.email}</UserEmail>
                    </UserInfo>
                </UserButton>
            </Container>

            <ProfileModal {...profileModal.state} onClose={profileModal.closeModal} />
            <UserManagementModal {...userManagementModal.state} onClose={userManagementModal.closeModal} />
        </>
    );
}
