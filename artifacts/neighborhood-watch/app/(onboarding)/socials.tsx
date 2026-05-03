import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

import { useWatcher } from "@/contexts/WatcherContext";
import { useColors } from "@/hooks/useColors";

export default function SocialsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { walletAddress, chain } = useLocalSearchParams<{
    walletAddress: string;
    chain: "solana" | "monad";
  }>();
  const { register } = useWatcher();

  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const validate = () => {
    const errs: Record<string, string> = {};
    const xTrimmed = xHandle.trim().replace(/^@/, "");
    const tgTrimmed = telegram.trim().replace(/^@/, "");
    const dcTrimmed = discord.trim();

    if (!xTrimmed) {
      errs.x = "X handle is required";
    } else if (!/^[A-Za-z0-9_]{1,15}$/.test(xTrimmed)) {
      errs.x = "Invalid X handle — use letters, numbers, underscores only";
    }

    if (!tgTrimmed) {
      errs.telegram = "Telegram handle is required";
    } else if (!/^[A-Za-z0-9_]{5,32}$/.test(tgTrimmed)) {
      errs.telegram = "Invalid Telegram handle (5–32 alphanumeric/underscore)";
    }

    if (!dcTrimmed) {
      errs.discord = "Discord handle is required";
    } else if (dcTrimmed.length < 2) {
      errs.discord = "Discord handle too short";
    }

    if (!confirmed) {
      errs.confirm = "You must confirm you follow @cooperanthllc";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        walletAddress: walletAddress!,
        chain: chain || "solana",
        xHandle: xHandle.trim().replace(/^@/, ""),
        telegramHandle: telegram.trim().replace(/^@/, ""),
        discordHandle: discord.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setErrors({ submit: err.message || "Registration failed. Try again." });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
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
            <View style={[styles.stepDot, { backgroundColor: colors.primary }]} />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.stepLabel, { color: colors.accent }]}>STEP 2 OF 2</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Community Membership
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Your social handles verify community membership. X follow is checked
            at 48 hours.
          </Text>
        </View>

        <View
          style={[
            styles.requirementBanner,
            {
              backgroundColor: colors.primary + "15",
              borderColor: colors.primary + "40",
            },
          ]}
        >
          <Feather name="twitter" size={16} color={colors.primary} />
          <Text style={[styles.requirementText, { color: colors.foreground }]}>
            You must follow{" "}
            <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>
              @cooperanthllc
            </Text>{" "}
            on X (Twitter) to qualify.
          </Text>
        </View>

        <View style={styles.fields}>
          <SocialField
            label="X (Twitter) Handle"
            prefix="@"
            value={xHandle}
            onChangeText={(t) => {
              setXHandle(t);
              if (errors.x) setErrors((e) => ({ ...e, x: "" }));
            }}
            error={errors.x}
            placeholder="cooperanth_user"
            focused={focusedField === "x"}
            onFocus={() => setFocusedField("x")}
            onBlur={() => setFocusedField(null)}
            colors={colors}
            icon="twitter"
          />
          <SocialField
            label="Telegram Handle"
            prefix="@"
            value={telegram}
            onChangeText={(t) => {
              setTelegram(t);
              if (errors.telegram) setErrors((e) => ({ ...e, telegram: "" }));
            }}
            error={errors.telegram}
            placeholder="my_telegram"
            focused={focusedField === "telegram"}
            onFocus={() => setFocusedField("telegram")}
            onBlur={() => setFocusedField(null)}
            colors={colors}
            icon="send"
          />
          <SocialField
            label="Discord Handle"
            prefix=""
            value={discord}
            onChangeText={(t) => {
              setDiscord(t);
              if (errors.discord) setErrors((e) => ({ ...e, discord: "" }));
            }}
            error={errors.discord}
            placeholder="username or user#1234"
            focused={focusedField === "discord"}
            onFocus={() => setFocusedField("discord")}
            onBlur={() => setFocusedField(null)}
            colors={colors}
            icon="message-circle"
          />
        </View>

        <Pressable
          style={styles.checkboxRow}
          onPress={() => {
            setConfirmed(!confirmed);
            if (errors.confirm) setErrors((e) => ({ ...e, confirm: "" }));
            Haptics.selectionAsync();
          }}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: confirmed ? colors.primary : "transparent",
                borderColor: errors.confirm ? colors.destructive : colors.border,
              },
            ]}
          >
            {confirmed && (
              <Feather name="check" size={12} color={colors.primaryForeground} />
            )}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.secondaryForeground }]}>
            I confirm I follow{" "}
            <Text style={{ color: colors.foreground }}>@cooperanthllc</Text> on X
            and understand my account will be verified at 48 hours.
          </Text>
        </Pressable>
        {errors.confirm ? (
          <Text style={[styles.fieldError, { color: colors.destructive }]}>
            {errors.confirm}
          </Text>
        ) : null}

        {errors.submit ? (
          <View
            style={[
              styles.submitError,
              { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.submitErrorText, { color: colors.destructive }]}>
              {errors.submit}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: isSubmitting
                ? colors.primary + "80"
                : colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Text
                style={[styles.submitText, { color: colors.primaryForeground }]}
              >
                Submit for Verification
              </Text>
              <Feather
                name="check-circle"
                size={18}
                color={colors.primaryForeground}
              />
            </>
          )}
        </Pressable>

        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          Telegram and Discord handles are collected for community records and
          not programmatically verified at this stage.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface SocialFieldProps {
  label: string;
  prefix: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  placeholder: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  icon: string;
}

function SocialField({
  label,
  prefix,
  value,
  onChangeText,
  error,
  placeholder,
  focused,
  onFocus,
  onBlur,
  colors,
  icon,
}: SocialFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>
        {label}
      </Text>
      <View
        style={[
          styles.fieldRow,
          {
            backgroundColor: colors.card,
            borderColor: error
              ? colors.destructive
              : focused
              ? colors.primary
              : colors.border,
          },
        ]}
      >
        <Feather name={icon as any} size={16} color={colors.mutedForeground} />
        {prefix ? (
          <Text style={[styles.prefix, { color: colors.mutedForeground }]}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          style={[styles.fieldInput, { color: colors.foreground }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          onFocus={onFocus}
          onBlur={onBlur}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {error ? (
        <Text style={[styles.fieldError, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
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
  stepLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  requirementBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  requirementText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  fields: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  prefix: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 24,
  },
  fieldError: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  checkboxRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  submitError: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  submitErrorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    textAlign: "center",
  },
});
