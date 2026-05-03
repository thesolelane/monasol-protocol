import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

const REJECTION_INFO: Record<
  string,
  { title: string; description: string; steps: string[] }
> = {
  REJECTED_NOT_FOLLOWING: {
    title: "Not Following @cooperanthllc",
    description:
      "You must follow @cooperanthllc on X (Twitter) to run a watcher node.",
    steps: [
      "Open X (Twitter) and search @cooperanthllc",
      "Click Follow",
      "Wait a few minutes for the follow to propagate",
      "Tap Resubmit below",
    ],
  },
  REJECTED_NOT_FOLLOWING_PROTOCOL: {
    title: "Not Following @mprotocol",
    description: "You must also follow @mprotocol on X to run a watcher node.",
    steps: [
      "Open X (Twitter) and search @mprotocol",
      "Click Follow",
      "Wait a few minutes for the follow to propagate",
      "Tap Resubmit below",
    ],
  },
  REJECTED_X_NOT_FOUND: {
    title: "X Handle Not Found",
    description:
      "The X handle you provided could not be found. Check the spelling.",
    steps: [
      "Verify your X username is correct (without the @)",
      "Make sure the account is public",
      "Tap Resubmit and re-enter the correct handle",
    ],
  },
  REJECTED_TOO_NEW: {
    title: "Wallet Too New",
    description:
      "Your wallet must have its first transaction at least 6 months ago.",
    steps: [
      "Wallets must be at least 6 months old",
      "Use a different wallet that is older and has on-chain history",
      "Tap Resubmit and enter the correct wallet address",
    ],
  },
  REJECTED_INACTIVE: {
    title: "Wallet Inactive",
    description:
      "Your wallet doesn't show enough activity over the past 6 months.",
    steps: [
      "Wallets must show activity in at least 3 rolling 2-month windows",
      "Use a wallet with consistent on-chain history",
      "Tap Resubmit and enter the correct wallet address",
    ],
  },
  REJECTED_NOT_FOUND: {
    title: "No On-Chain History",
    description:
      "No on-chain history was found for this wallet address. Verify the address is correct.",
    steps: [
      "Double-check the wallet address and chain you entered",
      "Ensure the wallet has been active on-chain",
      "Tap Resubmit and enter the correct address",
    ],
  },
  DEACTIVATED: {
    title: "Node Deactivated",
    description:
      "Your node failed two consecutive 30-day re-verification checks and has been deactivated.",
    steps: [
      "Ensure you still follow @cooperanthllc on X",
      "Ensure your wallet is still active on-chain",
      "Tap Resubmit to re-register from scratch",
    ],
  },
};

const DEFAULT_INFO = {
  title: "Verification Failed",
  description: "Your node application was not approved.",
  steps: [
    "Review the requirements and correct any issues",
    "Tap Resubmit to try again",
  ],
};

export default function RejectedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { node, resubmit } = useWatcher();
  const [isResubmitting, setIsResubmitting] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const reason = node?.rejectionReason || "";
  const info = REJECTION_INFO[reason] || DEFAULT_INFO;

  const handleResubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsResubmitting(true);
    try {
      await resubmit();
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 24, paddingBottom: bottomPad + 32 },
      ]}
    >
      <View style={styles.iconWrap}>
        <View
          style={[
            styles.iconRing,
            { borderColor: colors.destructive + "40", backgroundColor: colors.destructive + "10" },
          ]}
        >
          <Feather name="x-circle" size={52} color={colors.destructive} />
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.eyebrow, { color: colors.destructive }]}>
          VERIFICATION REJECTED
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {info.title}
        </Text>
        <Text style={[styles.description, { color: colors.secondaryForeground }]}>
          {info.description}
        </Text>
      </View>

      <View
        style={[
          styles.stepsCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.stepsTitle, { color: colors.foreground }]}>
          How to fix it
        </Text>
        {info.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Text style={[styles.stepNumberText, { color: colors.primary }]}>
                {i + 1}
              </Text>
            </View>
            <Text style={[styles.stepText, { color: colors.secondaryForeground }]}>
              {step}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.noteCard,
          { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" },
        ]}
      >
        <Feather name="info" size={14} color={colors.accent} />
        <Text style={[styles.noteText, { color: colors.secondaryForeground }]}>
          After resubmitting, a fresh 48-hour verification window starts. Your
          uptime clock resets.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.resubmitButton,
          {
            backgroundColor: isResubmitting ? colors.primary + "80" : colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        onPress={handleResubmit}
        disabled={isResubmitting}
      >
        {isResubmitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <>
            <Feather name="refresh-cw" size={18} color={colors.primaryForeground} />
            <Text style={[styles.resubmitText, { color: colors.primaryForeground }]}>
              Resubmit Application
            </Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
    alignItems: "center",
  },
  iconWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
  },
  stepsCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  stepsTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  stepText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  noteCard: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  noteText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    flex: 1,
  },
  resubmitButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  resubmitText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
