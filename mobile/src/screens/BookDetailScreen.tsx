import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mediaUrl } from '../api/client';
import { catalogApi, libraryApi } from '../api/services';
import { Button } from '../components/Button';
import { StateView } from '../components/StateView';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'BookDetail'>;

export function BookDetailScreen({ route, navigation }: Props) {
  const queryClient = useQueryClient();
  const book = useQuery({ queryKey: ['book', route.params.bookId], queryFn: () => catalogApi.book(route.params.bookId) });
  const memberRequests = useQuery({ queryKey: ['borrow-requests'], queryFn: libraryApi.requests });
  const memberLoans = useQuery({ queryKey: ['loans'], queryFn: libraryApi.loans });
  const eligibility = useQuery({ queryKey: ['borrowing-eligibility'], queryFn: libraryApi.eligibility });
  const request = useMutation({
    mutationFn: () => libraryApi.createRequest(route.params.bookId),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['borrow-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['books'] }),
      ]);
      Alert.alert('Request submitted', `${response.data.reference} is now pending librarian review.`, [
        { text: 'View My Library', onPress: () => navigation.navigate('MainTabs', { screen: 'Library' }) },
      ]);
    },
    onError: (error) => Alert.alert('Request not submitted', error instanceof Error ? error.message : 'Please try again.'),
  });

  if (book.isLoading) return <StateView loading message="Loading book…" />;
  if (book.isError || !book.data) return <StateView title="Book unavailable" message={(book.error as Error)?.message} actionLabel="Retry" onAction={() => void book.refetch()} />;

  const item = book.data.data;
  const cover = mediaUrl(item.cover_url);
  const hasOpenRequest = (memberRequests.data?.data ?? []).some(
    (entry) => entry.book.id === item.id && ['pending', 'approved'].includes(entry.status),
  );
  const hasActiveLoan = (memberLoans.data?.data ?? []).some(
    (entry) => entry.book_copy.book.id === item.id && entry.status !== 'returned',
  );
  const unavailableReason = eligibility.data?.data.can_borrow === false
    ? eligibility.data.data.reason
    : !item.is_active
    ? 'This title is archived and cannot be requested.'
    : item.available_copies === 0
      ? 'There are no available copies at the moment.'
      : hasActiveLoan
        ? 'You already have an active loan for this title.'
        : hasOpenRequest
          ? 'You already have an open request for this title.'
          : null;
  const canRequest = unavailableReason === null;

  const confirmRequest = () => Alert.alert(
    'Request this book?',
    'The librarian must approve your request before a copy can be issued.',
    [{ text: 'Not now', style: 'cancel' }, { text: 'Submit request', onPress: () => request.mutate() }],
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {cover ? <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" /> : (
          <View style={[styles.cover, styles.placeholder]}><Ionicons name="book-outline" size={62} color={colors.primary} /></View>
        )}
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.author}>by {item.author}</Text>
        <StatusPill status={item.availability_status} />
      </View>
      <View style={styles.card}>
        <InfoRow label="Category" value={item.category?.name ?? 'Uncategorized'} />
        <InfoRow label="ISBN" value={item.isbn} />
        <InfoRow label="Publisher" value={item.publisher ?? '—'} />
        <InfoRow label="Year" value={item.publication_year?.toString() ?? '—'} />
        <InfoRow label="Copies" value={`${item.available_copies} available of ${item.total_copies}`} last />
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>About this book</Text>
        <Text style={styles.description}>{item.description || 'No description has been added yet.'}</Text>
      </View>
      <Button
        label={canRequest ? 'Request to borrow' : 'Request unavailable'}
        loading={request.isPending}
        disabled={!canRequest}
        onPress={confirmRequest}
      />
      {unavailableReason ? <Text style={styles.unavailableReason}>{unavailableReason}</Text> : null}
      <Text style={styles.note}>Submitting a request does not issue a book. Visit the library after approval.</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  cover: { width: 150, height: 210, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  placeholder: { backgroundColor: '#FCE8EC', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  author: { color: colors.textMuted, fontSize: 15 },
  card: { padding: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  note: { color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  unavailableReason: { color: colors.danger, textAlign: 'center', fontSize: 13, lineHeight: 19 },
});
