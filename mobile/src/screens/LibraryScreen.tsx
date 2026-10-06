import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mediaUrl } from '../api/client';
import { libraryApi } from '../api/services';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateView } from '../components/StateView';
import { StatusPill } from '../components/StatusPill';
import { colors, radius, shadow, spacing } from '../theme/tokens';
import type { BorrowRequest, Loan } from '../types/api';
import { formatDate } from '../utils/format';
import type { MainTabsParamList } from '../navigation/types';

type Tab = 'requests' | 'borrowed' | 'history';
type Props = BottomTabScreenProps<MainTabsParamList, 'Library'>;

export function LibraryScreen({ route }: Props) {
  const [tab, setTab] = useState<Tab>('requests');
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['borrow-requests'], queryFn: libraryApi.requests });
  const loans = useQuery({ queryKey: ['loans'], queryFn: libraryApi.loans, refetchInterval: 30_000 });
  const eligibility = useQuery({ queryKey: ['borrowing-eligibility'], queryFn: libraryApi.eligibility, refetchInterval: 30_000 });
  const cancel = useMutation({
    mutationFn: libraryApi.cancelRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['borrow-requests'] });
      Alert.alert('Request cancelled');
    },
    onError: (error) => Alert.alert('Cannot cancel request', error instanceof Error ? error.message : 'Please try again.'),
  });

  const isLoading = requests.isLoading || loans.isLoading;
  const error = requests.error || loans.error;
  const pending = (requests.data?.data ?? []).filter((item) => ['pending', 'approved'].includes(item.status));
  const active = (loans.data?.data ?? []).filter((item) => item.status !== 'returned');
  const historyRequests = (requests.data?.data ?? []).filter((item) => ['rejected', 'cancelled'].includes(item.status));
  const returned = (loans.data?.data ?? []).filter((item) => item.status === 'returned');

  const refresh = async () => { await Promise.all([requests.refetch(), loans.refetch(), eligibility.refetch()]); };

  useEffect(() => {
    if (route.params?.initialTab) setTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Library" subtitle="Requests, borrowed books, and history" />
      {eligibility.data?.data.overdue_count ? <Text accessibilityRole="alert" style={{ padding: 16, color: colors.danger }}>{eligibility.data.data.reason}</Text> : null}
      <View style={styles.tabs}>
        {(['requests', 'borrowed', 'history'] as Tab[]).map((name) => (
          <Pressable key={name} style={[styles.tab, tab === name && styles.tabActive]} onPress={() => setTab(name)}>
            <Text style={[styles.tabText, tab === name && styles.tabTextActive]}>{name === 'borrowed' ? 'Borrowed' : name[0]?.toUpperCase() + name.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <StateView loading message="Loading your library…" /> : error ? (
        <StateView title="Could not load My Library" message={(error as Error).message} actionLabel="Retry" onAction={() => void refresh()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={requests.isRefetching || loans.isRefetching} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        >
          {tab === 'requests' ? (
            pending.length ? pending.map((item) => (
              <RequestCard key={item.id} item={item} cancelling={cancel.isPending} onCancel={() => Alert.alert('Cancel request?', item.book.title, [{ text: 'Keep request', style: 'cancel' }, { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate(item.id) }])} />
            )) : <StateView icon="time-outline" title="No active requests" message="Requests awaiting review will appear here." />
          ) : null}
          {tab === 'borrowed' ? (
            active.length ? active.map((item) => <LoanCard key={item.id} item={item} />) : <StateView icon="book-outline" title="No borrowed books" message="Approved and issued books will appear here." />
          ) : null}
          {tab === 'history' ? (
            returned.length || historyRequests.length ? <>{returned.map((item) => <LoanCard key={`loan-${item.id}`} item={item} />)}{historyRequests.map((item) => <RequestCard key={`request-${item.id}`} item={item} />)}</> : <StateView icon="archive-outline" title="No history yet" message="Completed, rejected, or cancelled records will appear here." />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Cover({ url }: { url: string | null }) {
  const source = mediaUrl(url);
  return source ? <Image source={{ uri: source }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPlaceholder]}><Ionicons name="book-outline" size={26} color={colors.primary} /></View>;
}

function RequestCard({ item, onCancel, cancelling }: { item: BorrowRequest; onCancel?: () => void; cancelling?: boolean }) {
  return (
    <View style={styles.card}>
      <Cover url={item.book.cover_url} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.book.title}</Text>
        <Text style={styles.cardSubtitle}>{item.book.author}</Text>
        <View style={styles.cardMeta}><StatusPill status={item.status} /><Text style={styles.reference}>{item.reference}</Text></View>
        <Text style={styles.date}>Requested {formatDate(item.requested_at)}</Text>
        {item.rejection_reason ? <Text style={styles.reason}>Reason: {item.rejection_reason}</Text> : null}
        {item.status === 'pending' && onCancel ? <Button label="Cancel request" variant="outline" loading={cancelling} onPress={onCancel} style={styles.smallButton} /> : null}
      </View>
    </View>
  );
}

function LoanCard({ item }: { item: Loan }) {
  const dueText = item.status === 'returned' ? `Returned ${formatDate(item.returned_at)}` : `Due ${formatDate(item.due_at)}`;
  return (
    <View style={styles.card}>
      <Cover url={item.book_copy.book.cover_url} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.book_copy.book.title}</Text>
        <Text style={styles.cardSubtitle}>{item.book_copy.book.author}</Text>
        <View style={styles.cardMeta}><StatusPill status={item.status} /><Text style={styles.reference}>{item.reference}</Text></View>
        <Text style={[styles.date, item.status === 'overdue' && styles.overdue]}>{dueText}</Text>
        <Text style={styles.accession}>Copy: {item.book_copy.accession_number}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', margin: spacing.lg, marginBottom: spacing.sm, padding: 4, backgroundColor: '#EAEAEA', borderRadius: radius.md },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: colors.white, ...shadow.card },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.primary },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.white, ...shadow.card },
  cover: { width: 68, height: 96, borderRadius: radius.sm },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCE8EC' },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  cardSubtitle: { color: colors.textMuted, fontSize: 13 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  reference: { color: colors.textMuted, fontSize: 11 },
  date: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 3 },
  accession: { color: colors.textMuted, fontSize: 11 },
  reason: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  overdue: { color: colors.danger },
  smallButton: { minHeight: 38, marginTop: spacing.sm },
});
