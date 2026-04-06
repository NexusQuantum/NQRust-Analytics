import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Form, Input, Button, Alert, Typography, Divider } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { signIn, useSession } from 'next-auth/react';
import styles from './login.module.less';

const { Title, Text } = Typography;

interface LoginPageProps {
    keycloakSSOEnabled: boolean;
}

export default function LoginPage({ keycloakSSOEnabled }: LoginPageProps) {
    const router = useRouter();
    const { status } = useSession();
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Check for NextAuth error in URL (e.g., ?error=CredentialsSignin)
    useEffect(() => {
        if (router.query.error) {
            const errMsg = router.query.error as string;
            if (errMsg === 'CredentialsSignin') {
                setError('Invalid email or password.');
            } else {
                setError(errMsg);
            }
        }
    }, [router.query]);

    // Redirect if already authenticated
    useEffect(() => {
        if (status === 'authenticated') {
            router.push('/home');
        }
    }, [status, router]);

    const handleSubmit = async (values: { email: string; password: string }) => {
        setError(null);
        setSubmitting(true);
        try {
            const result = await signIn('credentials', {
                email: values.email,
                password: values.password,
                redirect: false,
                callbackUrl: '/home',
            });
            if (result?.error) {
                setError('Invalid email or password.');
            } else if (result?.ok) {
                router.push('/home');
            }
        } catch {
            setError('Login failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeycloakLogin = () => {
        signIn('keycloak', { callbackUrl: '/home' });
    };

    if (status === 'loading') {
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

                    {/* Keycloak SSO Button */}
                    {keycloakSSOEnabled && (
                        <>
                            <div className={styles.oauthButtons}>
                                <Button
                                    size="large"
                                    block
                                    icon={<SafetyCertificateOutlined />}
                                    onClick={handleKeycloakLogin}
                                    className={styles.ssoButton}
                                >
                                    Login with NQRust Identity
                                </Button>
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
                                    message: 'Please enter a valid email',
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

// Expose KEYCLOAK_OAUTH_ENABLED to the client at build-time via server-side props
export async function getServerSideProps() {
    return {
        props: {
            keycloakSSOEnabled:
                process.env.KEYCLOAK_OAUTH_ENABLED === 'true' &&
                !!(process.env.KEYCLOAK_CLIENT_ID && process.env.KEYCLOAK_CLIENT_SECRET),
        },
    };
}
