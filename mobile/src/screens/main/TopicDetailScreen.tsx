import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import React from 'react';
import { View } from 'react-native';
import TopicDetailContent from '../../components/TopicDetailContent';
import { MaterialsStackParamList } from '../../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<MaterialsStackParamList, 'TopicDetail'>;
  route: RouteProp<MaterialsStackParamList, 'TopicDetail'>;
};

export default function TopicDetailScreen({ navigation, route }: Props) {
  const { topic, allTopics } = route.params;
  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <TopicDetailContent
        topic={topic}
        allTopics={allTopics}
        onNavigateTopic={(t) => navigation.push('TopicDetail', { topic: t, allTopics })}
      />
    </View>
  );
}
