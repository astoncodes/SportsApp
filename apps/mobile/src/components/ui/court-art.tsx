import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

/** Decorative court geometry; never presented as a photograph of a real venue. */
export function CourtArt({ height = 220 }: { height?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, backgroundColor: '#0B6047', overflow: 'hidden', borderRadius: 24 }}
    >
      <View
        style={{
          position: 'absolute',
          width: 330,
          height: 330,
          borderRadius: 165,
          backgroundColor: '#167854',
          right: -110,
          top: -125,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 30,
          right: 30,
          top: 26,
          bottom: -80,
          borderWidth: 2,
          borderColor: '#CDE1CB80',
          borderRadius: 5,
          transform: [{ rotate: '-13deg' }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: '25%',
            right: '25%',
            top: -2,
            height: 88,
            borderWidth: 2,
            borderColor: '#CDE1CB80',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '25%',
            right: '25%',
            top: 38,
            height: 100,
            borderWidth: 2,
            borderColor: '#CDE1CB80',
            borderRadius: 80,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            top: -100,
            height: 300,
            borderWidth: 2,
            borderColor: '#CDE1CB80',
            borderRadius: 160,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '43%',
            right: '43%',
            top: 16,
            height: 2,
            backgroundColor: '#F7F7F2',
          }}
        />
      </View>
      <View style={[styles.ball, { right: 36, top: 54 }]}>
        <MaterialCommunityIcons name="basketball" size={65} color="#733519" />
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 22,
          left: 24,
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: '#C8F56A',
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  ball: {
    position: 'absolute',
    backgroundColor: '#F29C58',
    width: 66,
    height: 66,
    borderRadius: 33,
    transform: [{ rotate: '20deg' }],
    shadowColor: '#052D21',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
});
