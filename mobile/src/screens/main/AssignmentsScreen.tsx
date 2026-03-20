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

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const deadline = new Date(item.deadline);
  const isOverdue = deadline < new Date() && item.completion_status !== "completed";
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>{item.title ?? "Без названия"}</Text>
        {item.completion_status === "overdue" && (
          <View style={[styles.badge, { backgroundColor: STATUS_COLOR.overdue }]}>
            <Text style={styles.badgeText}>Просрочено</Text>
          </View>
        )}
      </View>
      <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.deadline, isOverdue && { color: "#F44336" }]}>до {deadline.toLocaleDateString("ru-RU")}</Text>
        {item.grade != null && (<View style={styles.gradeBadge}><Text style={styles.gradeText}>{item.grade}</Text></View>)}
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
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
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
            <TouchableOpacity style={styles.sectionHeader} onPress={() => toggle(item.sectionKey)} activeOpacity={0.7}>
              <View style={[styles.sectionDot, { backgroundColor: item.color }]} />
              <Text style={styles.sectionTitle}>{item.label}</Text>
              <View style={styles.sectionCount}><Text style={styles.sectionCountText}>{item.count}</Text></View>
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
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, marginTop: 8, marginBottom: 4, gap: 8 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1a1a1a" },
  sectionCount: { backgroundColor: "#eee", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 12, fontWeight: "600", color: "#666" },
  sectionChevron: { fontSize: 18, color: "#bbb" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8, color: "#1a1a1a" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  description: { fontSize: 14, color: "#666", lineHeight: 20 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  deadline: { fontSize: 13, color: "#aaa", flex: 1 },
  responseHint: { fontSize: 12, color: "#4CAF50", fontWeight: "500" },
  gradeBadge: { backgroundColor: "#FFF8E1", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "#FFD54F" },
  gradeText: { fontSize: 13, fontWeight: "700", color: "#F57F17" },
  emptySection: { fontSize: 13, color: "#bbb", textAlign: "center", paddingVertical: 12 },
  empty: { textAlign: "center", color: "#999", marginTop: 60 },
});