import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Form, Input, Button, Alert, Typography, Divider } from 'antd';
import { MailOutlined, LockOutlined, GoogleOutlined, GithubOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';
import styles from './login.module.less';

const { Title, Text } = Typography;

interface OAuthProviders {
    google: boolean;
    github: boolean;
}

export default function LoginPage() {
    const router = useRouter();
    const { login, isAuthenticated, isLoading } = useAuth();
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [oauthProviders, setOauthProviders] = useState<OAuthProviders>({ google: false, github: false });
    const [oauthLoading, setOauthLoading] = useState(true);

    // Fetch enabled OAuth providers
    useEffect(() => {
        fetch('/api/auth/config')
            .then((res) => res.json())
            .then((data) => {
                setOauthProviders(data.providers || { google: false, github: false });
            })
            .catch(() => {
                // On error, assume no OAuth providers available
                setOauthProviders({ google: false, github: false });
            })
            .finally(() => {
                setOauthLoading(false);
            });
    }, []);

    // Check for OAuth error in URL
    useEffect(() => {
        if (router.query.error) {
            setError(router.query.error as string);
        }
    }, [router.query]);

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            router.push('/home');
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (values: { email: string; password: string }) => {
        setError(null);
        setSubmitting(true);

        try {
            await login(values.email, values.password);
            router.push('/home');
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOAuthLogin = (provider: 'google' | 'github') => {
        window.location.href = `/api/auth/oauth/${provider}`;
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Loading...</div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Login - NQRust Analytics</title>
            </Head>
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.header}>
                        <div className={styles.logo}>
                            <img src="/images/nexus-analytics-logo-192.png" alt="NQRust Analytics" />
                        </div>
                        <Title level={2} className={styles.title}>
                            Welcome Back
                        </Title>
                        <Text type="secondary">
                            Sign in to your NQRust Analytics account
                        </Text>
                    </div>

                    {error && (
                        <Alert
                            message={error}
                            type="error"
                            showIcon
                            closable
                            onClose={() => setError(null)}
                            className={styles.alert}
                        />
                    )}

                    {/* OAuth Buttons - only show if at least one provider is enabled */}
                    {!oauthLoading && (oauthProviders.google || oauthProviders.github) && (
                        <>
                            <div className={styles.oauthButtons}>
                                {oauthProviders.google && (
                                    <Button
                                        size="large"
                                        block
                                        icon={<GoogleOutlined />}
                                        onClick={() => handleOAuthLogin('google')}
                                        className={styles.googleButton}
                                    >
                                        Continue with Google
                                    </Button>
                                )}
                                {oauthProviders.github && (
                                    <Button
                                        size="large"
                                        block
                                        icon={<GithubOutlined />}
                                        onClick={() => handleOAuthLogin('github')}
                                        className={styles.githubButton}
                                    >
                                        Continue with GitHub
                                    </Button>
                                )}
                            </div>

                            <Divider plain>
                                <Text type="secondary">or sign in with email</Text>
                            </Divider>
                        </>
                    )}

                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        requiredMark={false}
                        size="large"
                    >
                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: 'Please enter your email' },
                                {
                                    pattern: /^[^\s@]+@[^\s@]+(\.[^\s@]+)?$/,
                                    message: 'Please enter a valid email'
                                },
                            ]}
                        >
                            <Input
                                prefix={<MailOutlined className={styles.inputIcon} />}
                                placeholder="Email address"
                                autoComplete="email"
                            />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            rules={[{ required: true, message: 'Please enter your password' }]}
                        >
                            <Input.Password
                                prefix={<LockOutlined className={styles.inputIcon} />}
                                placeholder="Password"
                                autoComplete="current-password"
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={submitting}
                                block
                                className={styles.submitButton}
                            >
                                Sign In
                            </Button>
                        </Form.Item>
                    </Form>
                </div>
            </div>
        </>
    );
}
