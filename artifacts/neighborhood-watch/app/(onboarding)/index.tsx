import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/wallet");
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topPad,
          paddingBottom: bottomPad + 24,
        },
      ]}
    >
      <View style={styles.content}>
        {/* Shield ring */}
        <View
          style={[
            styles.iconRing,
            {
              borderColor: colors.primary + "40",
              backgroundColor: colors.primary + "15",
            },
          ]}
        >
          <View
            style={[
              styles.iconInner,
              {
                borderColor: colors.primary + "60",
                backgroundColor: colors.primary + "25",
              },
            ]}
          >
            <Feather name="shield" size={48} color={colors.primary} />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.badgeRow}>
            <View style={[styles.badgeLine, { backgroundColor: colors.accent + "60" }]} />
            <Text style={[styles.badge, { color: colors.accent }]}>MSL</Text>
            <View style={[styles.badgeLine, { backgroundColor: colors.accent + "60" }]} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Neighborhood{"\n"}Watch
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Run a passive watcher node on your phone. Help protect the protocol
            and earn MSL rewards — no wallet connection, no private keys.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View
                style={[
                  styles.featureDot,
                  { backgroundColor: colors.accent + "30" },
                ]}
              >
                <Feather name={f.icon as any} size={14} color={colors.accent} />
              </View>
              <Text style={[styles.featureText, { color: colors.secondaryForeground }]}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleStart}
        >
          <Text style={[styles.startText, { color: colors.primaryForeground }]}>
            Start Watching
          </Text>
          <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
        </Pressable>
        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Read-only monitoring · No keys required · Community secured
        </Text>
      </View>
    </View>
  );
}

const FEATURES = [
  { icon: "eye", label: "Monitors lockers & vaults passively in background" },
  { icon: "alert-triangle", label: "Flags anomalies for guardian multisig review" },
  { icon: "gift", label: "Earn MSL rewards when staking goes live" },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: 36,
  },
  iconRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    gap: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badgeLine: {
    flex: 1,
    height: 1,
  },
  badge: {
    fontSize: 13,
    fontFamily: "BebasNeue_400Regular",
    letterSpacing: 5,
  },
  title: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    lineHeight: 48,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: 4,
  },
  features: {
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  footer: {
    gap: 16,
  },
  startButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
