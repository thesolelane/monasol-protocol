import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";

import { useWatcher } from "@/contexts/WatcherContext";
import { useColors } from "@/hooks/useColors";

type AppColors = ReturnType<typeof useColors>;
type FeatherIconName = ComponentProps<typeof Feather>["name"];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { node, devicePublicKey, isRooted, resubmit } = useWatcher();
  const [isResetting, setIsResetting] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleReset = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsResetting(true);
    try {
      await resubmit();
    } finally {
      setIsResetting(false);
    }
  };

  const pkFingerprint = devicePublicKey
    ? `Ed25519 · ${devicePublicKey.slice(0, 8)}…${devicePublicKey.slice(-8)}`
    : "Generating…";

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 80 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

      <Section title="Node Identity" colors={colors}>
        <InfoRow
          label="Wallet Address"
          value={
            node?.walletAddress
              ? `${node.walletAddress.slice(0, 10)}...${node.walletAddress.slice(-8)}`
              : "—"
          }
          icon="credit-card"
          colors={colors}
        />
        <InfoRow
          label="Chain"
          value={node?.chain === "monad" ? "Monad (EVM)" : "Solana (SVM)"}
          icon="link"
          colors={colors}
        />
        <InfoRow
          label="X Handle"
          value={node?.xHandle ? `@${node.xHandle}` : "—"}
          icon="twitter"
          colors={colors}
        />
        <InfoRow
          label="Telegram"
          value={node?.telegramHandle ? `@${node.telegramHandle}` : "—"}
          icon="send"
          colors={colors}
        />
        <InfoRow
          label="Discord"
          value={node?.discordHandle || "—"}
          icon="message-circle"
          colors={colors}
        />
      </Section>

      <Section title="Tier Status" colors={colors}>
        <View style={styles.tierRow}>
          <View
            style={[
              styles.tierIconBg,
              {
                backgroundColor:
                  node?.tier === 1
                    ? colors.accent + "20"
                    : colors.purple + "20",
              },
            ]}
          >
            <Feather
              name="shield"
              size={20}
              color={node?.tier === 1 ? colors.accent : colors.purple}
            />
          </View>
          <View style={styles.tierContent}>
            <Text style={[styles.tierName, { color: colors.foreground }]}>
              {node?.tier === 1 ? "Community Node" : "Registered Watcher"}
            </Text>
            <Text style={[styles.tierDesc, { color: colors.mutedForeground }]}>
              {node?.tier === 1
                ? "Tier 1 · 1× reward multiplier"
                : "Tier 2 · 2× reward multiplier"}
            </Text>
          </View>
          <View
            style={[
              styles.multiplierBadge,
              {
                backgroundColor:
                  node?.tier === 1
                    ? colors.accent + "20"
                    : colors.purple + "20",
              },
            ]}
          >
            <Text
              style={[
                styles.multiplierText,
                { color: node?.tier === 1 ? colors.accent : colors.purple },
              ]}
            >
              {node?.tier === 1 ? "1×" : "2×"}
            </Text>
          </View>
        </View>

        {node?.tier === 1 && (
          <View
            style={[
              styles.upgradeBanner,
              {
                backgroundColor: colors.purple + "10",
                borderColor: colors.purple + "30",
              },
            ]}
          >
            <Feather name="zap" size={14} color={colors.purple} />
            <Text style={[styles.upgradeText, { color: colors.secondaryForeground }]}>
              <Text style={{ color: colors.purple }}>Tier 2</Text> requires
              on-chain MSL stake. Staking will be available when MSL launches.
            </Text>
          </View>
        )}
      </Section>

      <Section title="Device Security" colors={colors}>
        <SecurityRow
          label="Signing Key"
          value={pkFingerprint}
          status="Active"
          statusOk
          icon="key"
          colors={colors}
        />
        <SecurityRow
          label="Report Signing"
          value="Ed25519 asymmetric signature on every report"
          status="Active"
          statusOk
          icon="pen-tool"
          colors={colors}
        />
        <SecurityRow
          label="Key Storage"
          value="Private key in Keychain / Keystore (OS-level encryption)"
          status="Secured"
          statusOk
          icon="database"
          colors={colors}
        />
        <SecurityRow
          label="Jailbreak / Root"
          value={
            isRooted === null
              ? "Detecting…"
              : isRooted
              ? "Root / jailbreak indicators detected — security may be compromised"
              : "No root / jailbreak indicators detected (expo-device heuristic)"
          }
          status={isRooted === null ? "Checking" : isRooted ? "DETECTED" : "Clear"}
          statusOk={isRooted === false}
          icon="shield"
          colors={colors}
        />
        <SecurityRow
          label="Transport Security"
          value="HTTPS enforced for all API calls · cert pinning requires a custom native EAS build"
          status="HTTPS only"
          statusOk={false}
          icon="lock"
          colors={colors}
        />
      </Section>

      <Section title="30-Day Re-Verification" colors={colors}>
        <View
          style={[
            styles.reVerifyNote,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="refresh-cw" size={14} color={colors.primary} />
          <Text
            style={[styles.reVerifyText, { color: colors.secondaryForeground }]}
          >
            Active nodes are re-verified every 30 days. Two consecutive failed
            checks result in deactivation. Ensure you maintain your X follows
            and wallet activity.
          </Text>
        </View>
      </Section>

      <Section title="Danger Zone" colors={colors} danger>
        <Pressable
          style={({ pressed }) => [
            styles.resetButton,
            {
              backgroundColor: isResetting
                ? colors.destructive + "50"
                : colors.destructive + "15",
              borderColor: colors.destructive + "40",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleReset}
          disabled={isResetting}
        >
          {isResetting ? (
            <ActivityIndicator color={colors.destructive} size="small" />
          ) : (
            <Feather name="trash-2" size={16} color={colors.destructive} />
          )}
          <View style={styles.resetTextBlock}>
            <Text style={[styles.resetTitle, { color: colors.destructive }]}>
              Reset & Resubmit
            </Text>
            <Text
              style={[styles.resetDesc, { color: colors.destructive + "AA" }]}
            >
              Clears all registration data and rotates the signing key. Starts
              fresh 48h verification.
            </Text>
          </View>
        </Pressable>
      </Section>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Neighborhood Watch v1.0.0 · MonaSol Protocol
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  colors,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  colors: AppColors;
  danger?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.sectionTitle,
          { color: danger ? colors.destructive : colors.mutedForeground },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  icon,
  colors,
}: {
  label: string;
  value: string;
  icon: FeatherIconName;
  colors: AppColors;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Feather name={icon} size={14} color={colors.mutedForeground} />
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SecurityRow({
  label,
  value,
  status,
  statusOk,
  icon,
  colors,
}: {
  label: string;
  value: string;
  status: string;
  statusOk: boolean;
  icon: FeatherIconName;
  colors: AppColors;
}) {
  const statusColor = statusOk ? colors.success : colors.destructive;

  return (
    <View style={[styles.secRow, { borderBottomColor: colors.border }]}>
      <View
        style={[styles.secIconBg, { backgroundColor: statusColor + "15" }]}
      >
        <Feather name={icon} size={13} color={statusColor} />
      </View>
      <View style={styles.secContent}>
        <Text style={[styles.secLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        <Text style={[styles.secValue, { color: colors.mutedForeground }]}>
          {value}
        </Text>
      </View>
      <Text style={[styles.secStatus, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  infoLabel: {
    width: 90,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  tierIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tierContent: {
    flex: 1,
    gap: 3,
  },
  tierName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  tierDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  multiplierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  multiplierText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  upgradeBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    margin: 12,
    marginTop: 0,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  upgradeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    flex: 1,
  },
  secRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  secIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  secContent: {
    flex: 1,
    gap: 2,
  },
  secLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  secValue: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  secStatus: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  reVerifyNote: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  reVerifyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    flex: 1,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetTextBlock: {
    flex: 1,
    gap: 3,
  },
  resetTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  resetDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  version: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
