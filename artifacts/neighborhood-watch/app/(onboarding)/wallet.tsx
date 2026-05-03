import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type Chain = "solana" | "monad";

function validateSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

function validateMonadAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export default function WalletScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chain, setChain] = useState<Chain>("solana");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const validate = () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Please enter your wallet address");
      return false;
    }
    if (chain === "solana" && !validateSolanaAddress(trimmed)) {
      setError("Invalid Solana address — should be 32–44 base58 characters");
      return false;
    }
    if (chain === "monad" && !validateMonadAddress(trimmed)) {
      setError("Invalid Monad address — should start with 0x followed by 40 hex characters");
      return false;
    }
    setError("");
    return true;
  };

  const handleContinue = () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/(onboarding)/socials",
      params: { walletAddress: address.trim(), chain },
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.container,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </Pressable>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, { backgroundColor: colors.primary }]} />
            <View style={[styles.stepDot, { backgroundColor: colors.border }]} />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.label, { color: colors.accent }]}>STEP 1 OF 2</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your Wallet
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Provide your public wallet address. This is where rewards will be
            sent. No connection or signing required.
          </Text>
        </View>

        <View style={styles.chainToggle}>
          {(["solana", "monad"] as Chain[]).map((c) => (
            <Pressable
              key={c}
              style={({ pressed }) => [
                styles.chainOption,
                {
                  backgroundColor:
                    chain === c ? colors.primary : colors.card,
                  borderColor:
                    chain === c ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => {
                setChain(c);
                setAddress("");
                setError("");
                Haptics.selectionAsync();
              }}
            >
              <Feather
                name={c === "solana" ? "sun" : "zap"}
                size={14}
                color={chain === c ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.chainText,
                  {
                    color: chain === c ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}
              >
                {c === "solana" ? "Solana" : "Monad"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: colors.secondaryForeground }]}>
            {chain === "solana" ? "Solana Address" : "Monad Address (0x...)"}
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                borderColor: error
                  ? colors.destructive
                  : focused
                  ? colors.primary
                  : colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={address}
              onChangeText={(t) => {
                setAddress(t);
                if (error) setError("");
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (address) validate();
              }}
              placeholder={
                chain === "solana"
                  ? "e.g. 7xKXtg2..."
                  : "e.g. 0x742d35..."
              }
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              multiline
              numberOfLines={2}
            />
          </View>
          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={13} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.securityNote,
            { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" },
          ]}
        >
          <Feather name="lock" size={14} color={colors.accent} />
          <Text style={[styles.securityText, { color: colors.secondaryForeground }]}>
            Read-only. Your address is stored securely on device. No private key
            or signing is ever required.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.continueButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleContinue}
        >
          <Text style={[styles.continueText, { color: colors.primaryForeground }]}>
            Continue
          </Text>
          <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicator: {
    flexDirection: "row",
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  titleBlock: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  chainToggle: {
    flexDirection: "row",
    gap: 10,
  },
  chainOption: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  chainText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  inputBlock: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputWrapper: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    minHeight: 44,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  securityNote: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  securityText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    flex: 1,
  },
  continueButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  continueText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
