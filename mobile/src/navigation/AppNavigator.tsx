import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { TheoryTopic } from '../api/materials';
import { Assignment } from '../api/assignments';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import AssignmentsScreen from '../screens/main/AssignmentsScreen';
import AssignmentDetailScreen from '../screens/main/AssignmentDetailScreen';
import MaterialsScreen from '../screens/main/MaterialsScreen';
import TopicDetailScreen from '../screens/main/TopicDetailScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import ScheduleScreen from '../screens/main/ScheduleScreen';

export type MaterialsStackParamList = {
  TopicsList: undefined;
  TopicDetail: { topic: TheoryTopic; allTopics: TheoryTopic[] };
};

export type AssignmentsStackParamList = {
  AssignmentsList: undefined;
  AssignmentDetail: { assignment: Assignment };
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const MaterialsStack = createNativeStackNavigator<MaterialsStackParamList>();
const AssignmentsStack = createNativeStackNavigator<AssignmentsStackParamList>();

function MaterialsNavigator() {
  return (
    <MaterialsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        headerTintColor: '#2AABEE',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <MaterialsStack.Screen
        name="TopicsList"
        component={MaterialsScreen}
        options={{ headerShown: false }}
      />
      <MaterialsStack.Screen
        name="TopicDetail"
        component={TopicDetailScreen}
        options={({ route }) => ({ title: (route.params as any).topic.title })}
      />
    </MaterialsStack.Navigator>
  );
}

function AssignmentsNavigator() {
  return (
    <AssignmentsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        headerTintColor: '#2AABEE',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <AssignmentsStack.Screen
        name="AssignmentsList"
        component={AssignmentsScreen}
        options={{ headerShown: false }}
      />
      <AssignmentsStack.Screen
        name="AssignmentDetail"
        component={AssignmentDetailScreen}
        options={({ route }) => ({
          title: (route.params as any).assignment.title ?? 'Задание',
        })}
      />
    </AssignmentsStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        tabBarActiveTintColor: '#2AABEE',
        tabBarInactiveTintColor: '#aaa',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
        tabBarStyle: {
          borderTopColor: '#f0f0f0',
          paddingTop: 6,
        },
      }}
    >
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Расписание',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Assignments"
        component={AssignmentsNavigator}
        options={{
          headerShown: false,
          tabBarLabel: 'Задания',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Materials"
        component={MaterialsNavigator}
        options={{
          headerShown: false,
          tabBarLabel: 'Материалы',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Профиль',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2AABEE" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
