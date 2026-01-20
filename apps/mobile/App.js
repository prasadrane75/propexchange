import React, { useEffect, useMemo, useState } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:4000';

export default function App() {
  const [properties, setProperties] = useState([]);
  const [wallet, setWallet] = useState({ items: [], totalValue: 0 });
  const [sellerProperties, setSellerProperties] = useState([]);
  const [sellerHoldings, setSellerHoldings] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [auth, setAuth] = useState({ user: null, token: '' });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('properties');
  const [listForm, setListForm] = useState({ title: '', description: '', priceTotal: '', sharesTotal: '' });
  const [buyForm, setBuyForm] = useState({ propertyId: '', shares: '' });
  const [photoIndex, setPhotoIndex] = useState({});

  const authHeader = useMemo(
    () => (auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    [auth.token]
  );

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  async function loadProperties() {
    const data = await apiRequest('/properties');
    setProperties(data.properties || []);
  }

  async function loadWallet() {
    const data = await apiRequest('/wallet', { headers: authHeader });
    setWallet({ items: data.items || [], totalValue: data.totalValue || 0 });
  }

  async function loadSellerData() {
    const [propertiesData, holdingsData] = await Promise.all([
      apiRequest('/seller/properties', { headers: authHeader }),
      apiRequest('/seller/holdings', { headers: authHeader }),
    ]);
    setSellerProperties(propertiesData.properties || []);
    setSellerHoldings(holdingsData.holdings || []);
  }

  async function loadApprovals() {
    const data = await apiRequest('/admin/properties/pending', { headers: authHeader });
    setPendingApprovals(data.properties || []);
  }

  useEffect(() => {
    loadProperties().catch(() => setError('Unable to load properties'));
  }, []);

  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      setAuth({ user: data.user, token: data.token });
      if (data.user.role === 'seller') {
        setActiveTab('inventory');
      } else if (data.user.role === 'admin') {
        setActiveTab('approvals');
      } else {
        setActiveTab('properties');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.user) {
      setWallet({ items: [], totalValue: 0 });
      setSellerProperties([]);
      setSellerHoldings([]);
      setPendingApprovals([]);
      return;
    }
    loadProperties().catch(() => {});
    if (auth.user.role === 'buyer') {
      loadWallet().catch(() => {});
    }
    if (auth.user.role === 'seller') {
      loadSellerData().catch(() => {});
    }
    if (auth.user.role === 'admin') {
      Promise.all([loadWallet(), loadSellerData(), loadApprovals()]).catch(() => {});
    }
  }, [auth.user, authHeader]);

  function handleLogout() {
    setAuth({ user: null, token: '' });
    setActiveTab('properties');
  }

  function getPhotoUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url}`;
  }

  function nextPhoto(propertyId, total) {
    setPhotoIndex((prev) => {
      const current = prev[propertyId] || 0;
      return { ...prev, [propertyId]: (current + 1) % total };
    });
  }

  function prevPhoto(propertyId, total) {
    setPhotoIndex((prev) => {
      const current = prev[propertyId] || 0;
      return { ...prev, [propertyId]: (current - 1 + total) % total };
    });
  }

  async function submitListing() {
    setError('');
    try {
      await apiRequest('/properties', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          title: listForm.title,
          description: listForm.description,
          priceTotal: Number(listForm.priceTotal),
          sharesTotal: Number(listForm.sharesTotal),
        }),
      });
      setListForm({ title: '', description: '', priceTotal: '', sharesTotal: '' });
      await loadSellerData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitBuy() {
    setError('');
    try {
      await apiRequest(`/properties/${buyForm.propertyId}/investments`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ shares: Number(buyForm.shares) }),
      });
      setBuyForm({ propertyId: '', shares: '' });
      await Promise.all([loadProperties(), loadWallet()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function approveProperty(id) {
    setError('');
    try {
      await apiRequest(`/admin/properties/${id}/approve`, {
        method: 'POST',
        headers: authHeader,
      });
      await Promise.all([loadApprovals(), loadProperties()]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Marketplace MVP</Text>
        <Text style={styles.subtitle}>Mobile scaffold for buyers and sellers.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!auth.user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={credentials.email}
              onChangeText={(text) => setCredentials((prev) => ({ ...prev, email: text }))}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={credentials.password}
              onChangeText={(text) => setCredentials((prev) => ({ ...prev, password: text }))}
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Login'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome</Text>
            <Text style={styles.muted}>Signed in as {auth.user.email}</Text>
            <Text style={styles.muted}>Role: {auth.user.role}</Text>
            <TouchableOpacity style={styles.button} onPress={handleLogout}>
              <Text style={styles.buttonText}>Log out</Text>
            </TouchableOpacity>
          </View>
        )}

        {auth.user ? (
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navButton, activeTab === 'properties' && styles.navButtonActive]}
              onPress={() => setActiveTab('properties')}
            >
              <Text style={styles.navButtonText}>Properties</Text>
            </TouchableOpacity>
            {(auth.user.role === 'buyer' || auth.user.role === 'admin') && (
              <TouchableOpacity
                style={[styles.navButton, activeTab === 'wallet' && styles.navButtonActive]}
                onPress={() => setActiveTab('wallet')}
              >
                <Text style={styles.navButtonText}>Wallet</Text>
              </TouchableOpacity>
            )}
            {(auth.user.role === 'seller' || auth.user.role === 'admin') && (
              <>
                <TouchableOpacity
                  style={[styles.navButton, activeTab === 'inventory' && styles.navButtonActive]}
                  onPress={() => setActiveTab('inventory')}
                >
                  <Text style={styles.navButtonText}>Inventory</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.navButton, activeTab === 'list' && styles.navButtonActive]}
                  onPress={() => setActiveTab('list')}
                >
                  <Text style={styles.navButtonText}>List</Text>
                </TouchableOpacity>
              </>
            )}
            {auth.user.role === 'admin' && (
              <TouchableOpacity
                style={[styles.navButton, activeTab === 'approvals' && styles.navButtonActive]}
                onPress={() => setActiveTab('approvals')}
              >
                <Text style={styles.navButtonText}>Approvals</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {activeTab === 'properties' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Available properties</Text>
            {properties.length ? (
              properties.map((property) => (
                <View key={property.id} style={styles.propertyItem}>
                  <Text style={styles.propertyTitle}>{property.title}</Text>
                  <Text style={styles.propertyMeta}>ID: {property.id}</Text>
                  <Text style={styles.propertyMeta}>{property.shares_available} / {property.shares_total} shares</Text>
                  {property.photos && property.photos.length ? (
                    <View style={styles.photoCard}>
                      <Text style={styles.propertyMeta}>Photos: {property.photos.length}</Text>
                      <Image
                        style={styles.photo}
                        source={{ uri: getPhotoUrl(property.photos[photoIndex[property.id] || 0]?.url) }}
                      />
                      <View style={styles.photoActions}>
                        <TouchableOpacity
                          style={styles.buttonAlt}
                          onPress={() => prevPhoto(property.id, property.photos.length)}
                        >
                          <Text style={styles.buttonAltText}>Prev</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.buttonAlt}
                          onPress={() => nextPhoto(property.id, property.photos.length)}
                        >
                          <Text style={styles.buttonAltText}>Next</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No properties yet.</Text>
            )}
            {(auth.user && (auth.user.role === 'buyer' || auth.user.role === 'admin')) ? (
              <View style={styles.section}>
                <Text style={styles.cardTitle}>Buy shares</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Property ID"
                  value={buyForm.propertyId}
                  onChangeText={(text) => setBuyForm((prev) => ({ ...prev, propertyId: text }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Shares"
                  value={buyForm.shares}
                  onChangeText={(text) => setBuyForm((prev) => ({ ...prev, shares: text }))}
                  keyboardType="number-pad"
                />
                <TouchableOpacity style={styles.button} onPress={submitBuy}>
                  <Text style={styles.buttonText}>Buy</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {activeTab === 'wallet' && auth.user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wallet</Text>
            {wallet.items.length ? (
              wallet.items.map((item) => (
                <View key={item.id} style={styles.propertyItem}>
                  <Text style={styles.propertyTitle}>{item.title}</Text>
                  <Text style={styles.propertyMeta}>Shares: {item.shares}</Text>
                  <Text style={styles.propertyMeta}>Value: ${Number(item.current_value).toFixed(2)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No holdings yet.</Text>
            )}
            <Text style={styles.totalValue}>Total: ${Number(wallet.totalValue).toFixed(2)}</Text>
          </View>
        ) : null}

        {activeTab === 'inventory' && auth.user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your inventory</Text>
            {sellerProperties.length ? (
              sellerProperties.map((property) => (
                <View key={property.id} style={styles.propertyItem}>
                  <Text style={styles.propertyTitle}>{property.title}</Text>
                  <Text style={styles.propertyMeta}>Status: {property.status}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No properties yet.</Text>
            )}
            <Text style={styles.cardTitle}>Investor holdings</Text>
            {sellerHoldings.length ? (
              sellerHoldings.map((holding, index) => (
                <View key={`${holding.property_id}-${index}`} style={styles.propertyItem}>
                  <Text style={styles.propertyTitle}>{holding.title}</Text>
                  <Text style={styles.propertyMeta}>Buyer: {holding.buyer_email || '—'}</Text>
                  <Text style={styles.propertyMeta}>Shares: {holding.shares || 0}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No investor activity yet.</Text>
            )}
          </View>
        ) : null}

        {activeTab === 'list' && auth.user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>List a property</Text>
            <Text style={styles.muted}>Photo upload is available on web for now.</Text>
            <TextInput
              style={styles.input}
              placeholder="Title"
              value={listForm.title}
              onChangeText={(text) => setListForm((prev) => ({ ...prev, title: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              value={listForm.description}
              onChangeText={(text) => setListForm((prev) => ({ ...prev, description: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Total price"
              value={listForm.priceTotal}
              onChangeText={(text) => setListForm((prev) => ({ ...prev, priceTotal: text }))}
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Total shares"
              value={listForm.sharesTotal}
              onChangeText={(text) => setListForm((prev) => ({ ...prev, sharesTotal: text }))}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.button} onPress={submitListing}>
              <Text style={styles.buttonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activeTab === 'approvals' && auth.user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending approvals</Text>
            {pendingApprovals.length ? (
              pendingApprovals.map((property) => (
                <View key={property.id} style={styles.propertyItem}>
                  <Text style={styles.propertyTitle}>{property.title}</Text>
                  <Text style={styles.propertyMeta}>Seller: {property.seller_email}</Text>
                  <TouchableOpacity style={styles.button} onPress={() => approveProperty(property.id)}>
                    <Text style={styles.buttonText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No pending approvals.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ed',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2428',
  },
  subtitle: {
    color: '#47535a',
  },
  error: {
    color: '#8f2b2b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: '#17212b',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccd2d7',
    borderRadius: 12,
    padding: 10,
  },
  button: {
    backgroundColor: '#1f2428',
    padding: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buttonAlt: {
    borderWidth: 1,
    borderColor: '#ccd2d7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  buttonAltText: {
    color: '#1f2428',
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  navButton: {
    borderWidth: 1,
    borderColor: '#ccd2d7',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  navButtonActive: {
    backgroundColor: '#1f2428',
    borderColor: '#1f2428',
  },
  navButtonText: {
    color: '#1f2428',
    fontWeight: '600',
  },
  propertyItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f2',
  },
  propertyTitle: {
    fontWeight: '600',
  },
  propertyMeta: {
    color: '#55626a',
    fontSize: 12,
  },
  muted: {
    color: '#5b676f',
  },
  section: {
    marginTop: 10,
    gap: 10,
  },
  totalValue: {
    fontWeight: '600',
    marginTop: 8,
  },
  photoCard: {
    marginTop: 8,
    gap: 8,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#eef1f2',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
});
