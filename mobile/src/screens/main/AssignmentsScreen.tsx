import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Assignment, getAssignments } from "../../api/assignments";
import { AssignmentsStackParamList } from "../../navigation/AppNavigator";

const STATUS_COLOR: Record<Assignment["completion_status"], string> = { assigned: "#2AABEE", in_progress: "#FF9800", completed: "#4CAF50", overdue: "#F44336" };
const SECTIONS = [
  { key: "assigned",    label: "Назначенные", statuses: ["assigned"],             color: "#2AABEE" },
  { key: "in_progress", label: "В работе",    statuses: ["in_progress"],          color: "#FF9800" },
  { key: "done",        label: "Выполненные", statuses: ["completed", "overdue"], color: "#4CAF50" },
] as const;

type SectionKey = "assigned" | "in_progress" | "done";
type Props = NativeStackScreenProps<AssignmentsStackParamList, "AssignmentsList">;

function gradeColor(grade: number) {
  if (grade >= 5) return { bg: '#E8F5E9', border: '#A5D6A7', text: '#2E7D32' };
  if (grade === 4) return { bg: '#E3F2FD', border: '#90CAF9', text: '#1565C0' };
  if (grade === 3) return { bg: '#FFF8E1', border: '#FFD54F', text: '#E65100' };
  return { bg: '#FFEBEE', border: '#EF9A9A', text: '#C62828' };
}

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const deadline = new Date(item.deadline);
  const isOverdue = deadline < new Date() && item.completion_status !== "completed";
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>{item.title ?? "Без названия"}</Text>
        {item.grade != null ? (
          <View style={[styles.gradeBadge, { backgroundColor: gradeColor(item.grade).bg, borderColor: gradeColor(item.grade).border }]}>
            <Text style={[styles.gradeText, { color: gradeColor(item.grade).text }]}>{item.grade}</Text>
          </View>
        ) : item.completion_status === "overdue" ? (
          <View style={[styles.badge, { backgroundColor: STATUS_COLOR.overdue }]}>
            <Text style={styles.badgeText}>Просрочено</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={[styles.deadline, isOverdue && { color: "#F44336" }]}>
          до {deadline.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AssignmentsScreen({ navigation }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({ assigned: false, in_progress: false, done: true });
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try { const data = await getAssignments(); setAssignments(data); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const toggle = (key: SectionKey) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  type ListItem =
    | { type: "header"; sectionKey: SectionKey; label: string; color: string; count: number }
    | { type: "item"; assignment: Assignment }
    | { type: "empty"; sectionKey: SectionKey };

  const listData: ListItem[] = [];
  for (const section of SECTIONS) {
    const items = assignments
      .filter(a => (section.statuses as readonly string[]).includes(a.completion_status))
      .sort((a, b) => b.id - a.id);
    if (items.length === 0 && section.key !== "done") continue;
    listData.push({ type: "header", sectionKey: section.key, label: section.label, color: section.color, count: items.length });
    if (!collapsed[section.key]) {
      if (items.length === 0) listData.push({ type: "empty", sectionKey: section.key });
      else items.forEach(a => listData.push({ type: "item", assignment: a }));
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return (
    <FlatList
      style={{ paddingTop: insets.top, backgroundColor: "#f5f5f5" }}
      data={listData}
      keyExtractor={(item, idx) =>
        item.type === "header" ? "h-" + item.sectionKey :
        item.type === "item"   ? "a-" + item.assignment.id : "empty-" + idx}
      renderItem={({ item }) => {
        if (item.type === "header") {
          const isCollapsed = collapsed[item.sectionKey];
          return (
            <TouchableOpacity style={[styles.sectionHeader, { borderLeftColor: item.color }]} onPress={() => toggle(item.sectionKey)} activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, { color: item.color }]}>{item.label}</Text>
              <View style={[styles.sectionCount, { backgroundColor: item.color + '22' }]}><Text style={[styles.sectionCountText, { color: item.color }]}>{item.count}</Text></View>
              <Text style={styles.sectionChevron}>{isCollapsed ? "›" : "˅"}</Text>
            </TouchableOpacity>
          );
        }
        if (item.type === "empty") return <Text style={styles.emptySection}>Нет заданий</Text>;
        return <AssignmentCard item={item.assignment} onPress={() => navigation.push("AssignmentDetail", { assignment: item.assignment })} />;
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Заданий нет</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingTop: 8 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 14,
    marginTop: 12, marginBottom: 6,
    backgroundColor: "#fff", borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  sectionCount: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 12, fontWeight: "700" },
  sectionChevron: { fontSize: 18, color: "#bbb" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8, color: "#1a1a1a", includeFontPadding: false },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  deadline: { fontSize: 13, color: "#aaa", flex: 1 },
  responseHint: { fontSize: 12, color: "#4CAF50", fontWeight: "500" },
  gradeBadge: { borderRadius: 10, width: 38, height: 38, borderWidth: 1.5, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  gradeText: { fontSize: 17, fontWeight: "800" },
  emptySection: { fontSize: 13, color: "#bbb", textAlign: "center", paddingVertical: 12 },
  empty: { textAlign: "center", color: "#999", marginTop: 60 },
});