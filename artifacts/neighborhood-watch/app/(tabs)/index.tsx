import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useWatcher } from "@/contexts/WatcherContext";
import { useColors } from "@/hooks/useColors";

const RING_SIZE = 160;
const STROKE = 10;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Token economics — community rate on mainnet
const MSL_PER_HOUR_TIER1 = 1;      // 1 MSL / hr at launch (Tier 1)
const MSL_PER_HOUR_TIER2 = 2;      // 2 MSL / hr at launch (Tier 2)
const TESTNET_MULTIPLIER  = 3;     // 3× bonus for testnet/devnet early birds

function hoursFromSeconds(s: number): number {
  return s / 3600;
}

function calcAccrued(seconds: number, tier: 1 | 2): number {
  const rate = tier === 1 ? MSL_PER_HOUR_TIER1 : MSL_PER_HOUR_TIER2;
  return hoursFromSeconds(seconds) * rate * TESTNET_MULTIPLIER;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatMSL(amount: number): string {
  if (amount < 0.001) return "0.000";
  if (amount < 1) return amount.toFixed(3);
  if (amount < 1000) return amount.toFixed(2);
  return `${(amount / 1000).toFixed(2)}K`;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { node, observations, refreshStatus, isRefreshing } = useWatcher();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const tier        = (node?.tier || 1) as 1 | 2;
  const tierLabel   = tier === 1 ? "Community Node" : "Registered Watcher";
  const tierColor   = tier === 1 ? colors.accent : colors.purple;
  const uptimeSecs  = node?.uptimeSeconds || 0;
  const reportCount = node?.reportCount ?? 0;
  const lockerCount = node?.lockerCount || observations.length;

  // Live accrual numbers
  const hoursActive  = hoursFromSeconds(uptimeSecs);
  const mslAccrued   = calcAccrued(uptimeSecs, tier);
  const ratePerHour  = tier === 1 ? MSL_PER_HOUR_TIER1 : MSL_PER_HOUR_TIER2;
  const mainnetRate  = ratePerHour; // same rate, no multiplier on mainnet

  // Ring shows hour progress toward the next full hour
  const minutesPastHour = (uptimeSecs % 3600) / 60;
  const ringProgress    = minutesPastHour / 60;
  const strokeDash      = CIRCUMFERENCE * ringProgress;
  const strokeGap       = CIRCUMFERENCE - strokeDash;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 80 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            refreshStatus();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            MonaSol Protocol
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your Node
          </Text>
        </View>
        <View
          style={[
            styles.activeChip,
            { backgroundColor: colors.success + "20", borderColor: colors.success + "40" },
          ]}
        >
          <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.activeText, { color: colors.success }]}>Active</Text>
        </View>
      </View>

      {/* Hour ring + node info */}
      <View style={styles.ringSection}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
              stroke={colors.border} strokeWidth={STROKE} fill="none"
            />
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
              stroke={colors.primary} strokeWidth={STROKE} fill="none"
              strokeDasharray={`${strokeDash} ${strokeGap}`}
              strokeLinecap="round"
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Text style={[styles.ringHours, { color: colors.foreground }]}>
              {Math.floor(hoursActive)}
            </Text>
            <Text style={[styles.ringLabel, { color: colors.mutedForeground }]}>
              hrs active
            </Text>
          </View>
        </View>

        <View style={styles.ringInfo}>
          <View
            style={[
              styles.tierBadge,
              { backgroundColor: tierColor + "20", borderColor: tierColor + "40" },
            ]}
          >
            <Feather name="shield" size={12} color={tierColor} />
            <Text style={[styles.tierLabel, { color: tierColor }]}>{tierLabel}</Text>
          </View>
          <Text style={[styles.walletAddr, { color: colors.mutedForeground }]}>
            {node?.walletAddress
              ? `${node.walletAddress.slice(0, 8)}...${node.walletAddress.slice(-6)}`
              : "—"}
          </Text>
          <Text style={[styles.chainLabel, { color: colors.mutedForeground }]}>
            {node?.chain === "monad" ? "Monad EVM" : "Solana"}
          </Text>
          <Text style={[styles.uptimeSmall, { color: colors.mutedForeground }]}>
            ⏱ {formatHours(uptimeSecs)} uptime
          </Text>
        </View>
      </View>

      {/* MSL Accrual hero card */}
      <View
        style={[
          styles.accrualCard,
          { backgroundColor: colors.card, borderColor: colors.primary + "50" },
        ]}
      >
        <View style={styles.accrualTop}>
          <View>
            <Text style={[styles.accrualLabel, { color: colors.mutedForeground }]}>
              MSL ACCRUING
            </Text>
            <Text style={[styles.accrualValue, { color: colors.foreground }]}>
              {formatMSL(mslAccrued)}{" "}
              <Text style={[styles.accrualUnit, { color: colors.primary }]}>MSL</Text>
            </Text>
          </View>
          <View style={[styles.rateTag, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
            <Feather name="clock" size={12} color={colors.primary} />
            <Text style={[styles.rateText, { color: colors.primary }]}>
              {ratePerHour} MSL / hr
            </Text>
          </View>
        </View>

        <View style={[styles.accrualDivider, { backgroundColor: colors.border }]} />

        <View style={styles.accrualBottom}>
          <Feather name="zap" size={13} color={colors.accent} />
          <Text style={[styles.accrualNote, { color: colors.accent }]}>
            Early testnet bonus active — {TESTNET_MULTIPLIER}× multiplier applied
          </Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="clock"
          label="Hours Active"
          value={formatHours(uptimeSecs)}
          color={colors.primary}
          colors={colors}
        />
        <StatCard
          icon="eye"
          label="Lockers Watched"
          value={String(lockerCount)}
          color={colors.accent}
          colors={colors}
        />
        <StatCard
          icon="alert-triangle"
          label="Alerts Filed"
          value={String(reportCount)}
          color={colors.warning}
          colors={colors}
        />
        <StatCard
          icon="gift"
          label="Projected MSL"
          value={formatMSL(mslAccrued)}
          color={colors.success}
          colors={colors}
        />
      </View>

      {/* Mainnet bonus explanation */}
      <View
        style={[
          styles.bonusCard,
          { backgroundColor: colors.card, borderColor: colors.accent + "40" },
        ]}
      >
        <View style={styles.bonusHeader}>
          <View style={[styles.bonusIcon, { backgroundColor: colors.accent + "20" }]}>
            <Feather name="star" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bonusTitle, { color: colors.foreground }]}>
              Testnet Early Bird Bonus
            </Text>
            <Text style={[styles.bonusSub, { color: colors.mutedForeground }]}>
              Participating now on testnet/devnet
            </Text>
          </View>
        </View>

        <View style={styles.bonusRows}>
          <BonusRow
            label="Your hours banked so far"
            value={`${hoursActive.toFixed(2)} hrs`}
            colors={colors}
          />
          <BonusRow
            label={`Mainnet rate (at launch)`}
            value={`${mainnetRate} MSL / hr`}
            colors={colors}
          />
          <BonusRow
            label="Early bird multiplier"
            value={`${TESTNET_MULTIPLIER}×`}
            highlight
            colors={colors}
          />
          <BonusRow
            label="Projected mainnet reward"
            value={`${formatMSL(mslAccrued)} MSL`}
            highlight
            colors={colors}
          />
        </View>

        <Text style={[styles.bonusDisclaimer, { color: colors.mutedForeground }]}>
          Hours are recorded on-chain. The more you participate now, the bigger
          your reward at token launch.
        </Text>
      </View>

      {/* Upgrade card for Tier 1 */}
      {tier === 1 && (
        <Pressable
          style={({ pressed }) => [
            styles.upgradeCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.purple + "50",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <View style={{ flex: 1 }}>
            <View style={[styles.upgradeBadge, { backgroundColor: colors.purple + "20" }]}>
              <Text style={[styles.upgradeBadgeText, { color: colors.purple }]}>
                TIER 2
              </Text>
            </View>
            <Text style={[styles.upgradeTitle, { color: colors.foreground }]}>
              Upgrade to Registered Watcher
            </Text>
            <Text style={[styles.upgradeDesc, { color: colors.mutedForeground }]}>
              Stake MSL tokens for 2× rate ({MSL_PER_HOUR_TIER2} MSL/hr) when staking launches.
            </Text>
          </View>
          <Feather name="arrow-right" size={18} color={colors.purple} />
        </Pressable>
      )}
    </ScrollView>
  );
}

function StatCard({
  icon, label, value, color, colors,
}: {
  icon: string; label: string; value: string; color: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIconBg, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function BonusRow({
  label, value, highlight, colors,
}: {
  label: string; value: string; highlight?: boolean; colors: any;
}) {
  return (
    <View style={styles.bonusRow}>
      <Text style={[styles.bonusRowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.bonusRowValue,
          { color: highlight ? colors.accent : colors.foreground },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 20 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  activeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 4,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  ringSection: { flexDirection: "row", gap: 20, alignItems: "center" },
  ringWrap: { position: "relative", width: RING_SIZE, height: RING_SIZE },
  ringCenter: { alignItems: "center", justifyContent: "center" },
  ringHours: { fontSize: 36, fontFamily: "Inter_700Bold" },
  ringLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  ringInfo: { flex: 1, gap: 8 },
  tierBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, alignSelf: "flex-start",
  },
  tierLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  walletAddr: { fontSize: 13, fontFamily: "Inter_500Medium" },
  chainLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  uptimeSmall: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // MSL accrual card
  accrualCard: { borderWidth: 1.5, borderRadius: 18, padding: 18, gap: 14 },
  accrualTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  accrualLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 4 },
  accrualValue: { fontSize: 40, fontFamily: "Inter_700Bold", lineHeight: 44 },
  accrualUnit: { fontSize: 24, fontFamily: "Inter_700Bold" },
  rateTag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  rateText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  accrualDivider: { height: 1 },
  accrualBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  accrualNote: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "47.5%", padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  statIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Bonus card
  bonusCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  bonusHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bonusIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bonusTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  bonusSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bonusRows: { gap: 10 },
  bonusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bonusRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bonusRowValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  bonusDisclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  // Upgrade card
  upgradeCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
  upgradeBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  upgradeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  upgradeTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  upgradeDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
