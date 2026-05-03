// Import background task definition before any component mounts.
// TaskManager.defineTask must be called at module init time (not inside React).
import "@/utils/backgroundTask";

import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Href, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WatcherProvider, useWatcher } from "@/contexts/WatcherContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { status } = useWatcher();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (status === "LOADING") return;

    const firstSegment = segments[0] as string | undefined;
    const inOnboarding = firstSegment === "(onboarding)";
    const inTabs = firstSegment === "(tabs)";
    const inPending = firstSegment === "pending";
    const inRejected = firstSegment === "rejected";

    if (status === "UNREGISTERED" && !inOnboarding) {
      // Expo Router v6 does not generate static types for group-index paths.
      // Casting to Href is the narrowest correct type for this workaround.
      router.replace("/(onboarding)/index" as Href);
    } else if (status === "PENDING" && !inPending) {
      router.replace("/pending");
    } else if (
      (status === "REJECTED" || status === "DEACTIVATED") &&
      !inRejected
    ) {
      router.replace("/rejected");
    } else if (status === "ACTIVE" && !inTabs) {
      router.replace("/(tabs)/index" as Href);
    }
  }, [status, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="rejected" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <WatcherProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </WatcherProvider>
  );
}
