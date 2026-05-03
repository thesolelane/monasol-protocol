import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type Observation, useWatcher } from "@/contexts/WatcherContext";
import { useColors } from "@/hooks/useColors";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

const ALERT_COLORS: Record<string, string> = {
  AUTH_FAILURES: "#F59E0B",
  UNUSUAL_PATTERN: "#8247E5",
  LARGE_OUTFLOW: "#EF4444",
  NFT_TRANSFER: "#3B82F6",
  NODE_HEALTH_LOW: "#F97316",
  SUB_VAULT_BREACH: "#EF4444",
};

const ALERT_ICONS: Record<string, FeatherIconName> = {
  AUTH_FAILURES: "key",
  UNUSUAL_PATTERN: "activity",
  LARGE_OUTFLOW: "trending-down",
  NFT_TRANSFER: "box",
  NODE_HEALTH_LOW: "heart",
  SUB_VAULT_BREACH: "shield-off",
};

const SEVERITY_LABELS = ["", "Low", "Medium", "High"];

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function ObsRow({ item, colors }: { item: Observation; colors: ReturnType<typeof useColors> }) {
  const alertColor = ALERT_COLORS[item.type] || colors.accent;
  const alertIcon: FeatherIconName = ALERT_ICONS[item.type] ?? "alert-circle";
  const severityLabel = SEVERITY_LABELS[item.severity] || "Low";

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[styles.iconBg, { backgroundColor: alertColor + "20" }]}
      >
        <Feather name={alertIcon} size={15} color={alertColor} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowType, { color: colors.foreground }]}>
            {item.type.replace(/_/g, " ")}
          </Text>
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: alertColor + "20" },
            ]}
          >
            <Text style={[styles.severityText, { color: alertColor }]}>
              {severityLabel}
            </Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Feather name="map-pin" size={11} color={colors.mutedForeground} />
          <Text style={[styles.lockerId, { color: colors.mutedForeground }]}>
            {item.lockerId}
          </Text>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
            · {timeAgo(item.timestamp)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { observations, refreshStatus, isRefreshing } = useWatcher();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={observations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topPad + 16, paddingBottom: bottomPad + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshStatus}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Activity
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {observations.length > 0
                ? `${observations.length} anomaly${observations.length === 1 ? "" : "s"} detected`
                : "Monitoring for anomalies..."}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => <ObsRow item={item} colors={colors} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconBg,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="shield" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No anomalies detected
            </Text>
            <Text
              style={[styles.emptyDesc, { color: colors.mutedForeground }]}
            >
              Your node is watching. Anomalies will appear here when detected.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 0,
  },
  listHeader: {
    marginBottom: 20,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 5,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowType: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  severityText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lockerId: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  timeAgo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 14,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
