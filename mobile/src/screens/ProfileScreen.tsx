import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Constants from 'expo-constants';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ScreenHeader } from '../components/ScreenHeader';
import type { MainTabsParamList, RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = BottomTabScreenProps<MainTabsParamList, 'Profile'>;

export function ProfileScreen(_: Props) {
  const root = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, updateProfile, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter your display name.');
    setSaving(true);
    try {
      await updateProfile(name);
      setEditing(false);
      Alert.alert('Profile updated');
    } catch (error) {
      Alert.alert('Profile not updated', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => Alert.alert(
    'Log out?',
    'You will need your email and password to access your library account again.',
    [{ text: 'Stay signed in', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => void logout() }],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My profile" subtitle="Manage your member account" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: colors.textMuted }}>App version {Constants.expoConfig?.version ?? 'unknown'} — build {Constants.expoConfig?.android?.versionCode ?? 'unknown'}</Text>
        <View style={styles.profileCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.member}>Member ID: {user.member_id}</Text>
          </View>
        </View>

        {user.library_card_code ? (
          <View style={styles.libraryCard}>
            <View style={styles.libraryCardCopy}>
              <Text style={styles.libraryCardEyebrow}>RCJK LIBRARY CARD</Text>
              <Text style={styles.libraryCardTitle}>Present this code to the librarian</Text>
              <Text style={styles.libraryCardHint}>The librarian scans it to find your member account during borrowing.</Text>
              <Text selectable style={styles.libraryCardCode}>{user.library_card_code}</Text>
            </View>
            <View style={styles.qrSurface}>
              <QRCode value={user.library_card_code} size={126} color={colors.text} backgroundColor={colors.white} />
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account details</Text>
            {!editing ? <Text style={styles.editLink} onPress={() => setEditing(true)}>Edit</Text> : null}
          </View>
          {editing ? (
            <View style={styles.editForm}>
              <Input label="Display name" value={name} onChangeText={setName} autoComplete="name" />
              <Text style={styles.hint}>For security, your email and member ID are managed by the library staff.</Text>
              <Button label="Save changes" loading={saving} onPress={() => void save()} />
              <Button label="Cancel" variant="text" onPress={() => { setName(user.name); setEditing(false); }} />
            </View>
          ) : (
            <>
              <Detail label="Name" value={user.name} />
              <Detail label="Email" value={user.email} />
              <Detail label="Member ID" value={user.member_id} last />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Security</Text>
          <MenuItem icon="lock-closed-outline" label="Change password" onPress={() => root.navigate('ChangePassword')} />
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>About</Text>
          <MenuItem icon="help-circle-outline" label="Library help" detail="Ask your librarian for borrowing assistance." />
          <MenuItem icon="phone-portrait-outline" label="RCJK Library" detail="Version 1.0.0" last />
        </View>
        <Button label="Log out" variant="outline" onPress={confirmLogout} />
      </ScrollView>
    </View>
  );
}

function Detail({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.detail, last && styles.detailLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function MenuItem({ icon, label, detail, last = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; last?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} style={[styles.menuItem, last && styles.menuItemLast]} onPress={onPress}>
      <Ionicons name={icon} size={21} color={colors.primary} />
      <View style={styles.menuText}><Text style={styles.menuLabel}>{label}</Text>{detail ? <Text style={styles.menuDetail}>{detail}</Text> : null}</View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#FDECEF', borderWidth: 1, borderColor: '#F7CBD3' },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarText: { color: colors.white, fontSize: 25, fontWeight: '800' },
  profileInfo: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 19, fontWeight: '800' },
  email: { color: colors.textMuted, fontSize: 13 },
  member: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  libraryCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primaryDark, ...shadow.card },
  libraryCardCopy: { flex: 1, gap: spacing.xs },
  libraryCardEyebrow: { color: '#FAD9DE', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  libraryCardTitle: { color: colors.white, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  libraryCardHint: { color: '#FDECEF', fontSize: 12, lineHeight: 17 },
  libraryCardCode: { color: '#FAD9DE', fontSize: 10, fontWeight: '700', marginTop: spacing.xs },
  qrSurface: { padding: 10, borderRadius: radius.md, backgroundColor: colors.white },
  card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, ...shadow.card },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  editLink: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  detailLast: { borderBottomWidth: 0 },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  editForm: { gap: spacing.md, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  menuItemLast: { borderBottomWidth: 0 },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  menuDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
