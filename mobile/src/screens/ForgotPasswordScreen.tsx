import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert } from 'react-native';

import { authApi } from '../api/services';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter your account email.');
    setLoading(true);
    try {
      const response = await authApi.forgotPassword(email.trim().toLowerCase());
      Alert.alert('Check your email', response.message, [
        { text: 'Enter reset token', onPress: () => navigation.navigate('ResetPassword', { email }) },
      ]);
    } catch (error) {
      Alert.alert('Request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We will email a reset token if the address belongs to an account.">
      <Input label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Button label="Send reset instructions" loading={loading} onPress={() => void submit()} />
      <Button label="I already have a reset token" variant="outline" onPress={() => navigation.navigate('ResetPassword', { email })} />
      <Button label="Back to sign in" variant="text" onPress={() => navigation.goBack()} />
    </AuthShell>
  );
}
