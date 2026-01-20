import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api.js';

const ROLES = ['buyer', 'seller', 'admin'];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', role: 'buyer' });
  const [properties, setProperties] = useState([]);
  const [wallet, setWallet] = useState({ items: [], totalValue: 0 });
  const [sellerHoldings, setSellerHoldings] = useState([]);
  const [sellerProperties, setSellerProperties] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [error, setError] = useState('');
  const [propertyForm, setPropertyForm] = useState({ title: '', description: '', priceTotal: '', sharesTotal: '' });
  const [investmentForm, setInvestmentForm] = useState({ propertyId: '', shares: '' });
  const [editingPropertyId, setEditingPropertyId] = useState(null);
  const [propertyPhotos, setPropertyPhotos] = useState([]);
  const [photoIndex, setPhotoIndex] = useState({});
  const [activeSection, setActiveSection] = useState('browse');

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  useEffect(() => {
    apiRequest('/properties')
      .then((data) => setProperties(data.properties || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!user || (user.role !== 'buyer' && user.role !== 'admin')) {
      setWallet({ items: [], totalValue: 0 });
      return;
    }
    apiRequest('/wallet', { headers: authHeader })
      .then((data) => setWallet({ items: data.items || [], totalValue: data.totalValue || 0 }))
      .catch(() => setWallet({ items: [], totalValue: 0 }));
  }, [user, authHeader]);

  useEffect(() => {
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      setSellerHoldings([]);
      return;
    }
    apiRequest('/seller/holdings', { headers: authHeader })
      .then((data) => setSellerHoldings(data.holdings || []))
      .catch(() => setSellerHoldings([]));
  }, [user, authHeader]);

  useEffect(() => {
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      setSellerProperties([]);
      return;
    }
    apiRequest('/seller/properties', { headers: authHeader })
      .then((data) => setSellerProperties(data.properties || []))
      .catch(() => setSellerProperties([]));
  }, [user, authHeader]);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      setPendingApprovals([]);
      return;
    }
    apiRequest('/admin/properties/pending', { headers: authHeader })
      .then((data) => setPendingApprovals(data.properties || []))
      .catch(() => setPendingApprovals([]));
  }, [user, authHeader]);

  function handleAuthChange(event) {
    const { name, value } = event.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = authMode === 'register'
        ? { email: authForm.email, password: authForm.password, role: authForm.role }
        : { email: authForm.email, password: authForm.password };
      const data = await apiRequest(`/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    setToken('');
    setUser(null);
    setWallet({ items: [], totalValue: 0 });
    setSellerHoldings([]);
    setSellerProperties([]);
    setPendingApprovals([]);
    setActiveSection('browse');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function handlePropertyChange(event) {
    const { name, value } = event.target;
    setPropertyForm((prev) => ({ ...prev, [name]: value }));
  }

  function handlePhotoChange(event) {
    const files = Array.from(event.target.files || []);
    setPropertyPhotos(files);
  }

  function getPhotoUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}${url}`;
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

  function startEdit(property) {
    setEditingPropertyId(property.id);
    setPropertyForm({
      title: property.title || '',
      description: property.description || '',
      priceTotal: property.price_total || '',
      sharesTotal: property.shares_total || '',
    });
    setPropertyPhotos([]);
    setActiveSection('list');
  }

  function cancelEdit() {
    setEditingPropertyId(null);
    setPropertyForm({ title: '', description: '', priceTotal: '', sharesTotal: '' });
    setPropertyPhotos([]);
  }

  async function submitProperty(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = {
        title: propertyForm.title,
        description: propertyForm.description,
        priceTotal: Number(propertyForm.priceTotal),
        sharesTotal: Number(propertyForm.sharesTotal),
      };
      let propertyId = editingPropertyId;
      if (editingPropertyId) {
        const data = await apiRequest(`/properties/${editingPropertyId}`, {
          method: 'PUT',
          headers: authHeader,
          body: JSON.stringify(payload),
        });
        propertyId = data.property?.id || editingPropertyId;
      } else {
        const data = await apiRequest('/properties', {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify(payload),
        });
        propertyId = data.property?.id;
      }
      if (propertyId && propertyPhotos.length) {
        const formData = new FormData();
        propertyPhotos.forEach((file) => formData.append('photos', file));
        await apiRequest(`/properties/${propertyId}/photos`, {
          method: 'POST',
          headers: authHeader,
          body: formData,
        });
      }
      const listData = await apiRequest('/properties');
      setProperties(listData.properties || []);
      if (user && (user.role === 'seller' || user.role === 'admin')) {
        const holdingsData = await apiRequest('/seller/holdings', { headers: authHeader });
        setSellerHoldings(holdingsData.holdings || []);
        const inventoryData = await apiRequest('/seller/properties', { headers: authHeader });
        setSellerProperties(inventoryData.properties || []);
      }
      cancelEdit();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleInvestmentChange(event) {
    const { name, value } = event.target;
    setInvestmentForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitInvestment(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await apiRequest(`/properties/${investmentForm.propertyId}/investments`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ shares: Number(investmentForm.shares) }),
      });
      setProperties((prev) => prev.map((property) => (
        property.id === data.property.id ? data.property : property
      )));
      if (user && (user.role === 'buyer' || user.role === 'admin')) {
        const walletData = await apiRequest('/wallet', { headers: authHeader });
        setWallet({ items: walletData.items || [], totalValue: walletData.totalValue || 0 });
      }
      if (user && (user.role === 'seller' || user.role === 'admin')) {
        const holdingsData = await apiRequest('/seller/holdings', { headers: authHeader });
        setSellerHoldings(holdingsData.holdings || []);
        const inventoryData = await apiRequest('/seller/properties', { headers: authHeader });
        setSellerProperties(inventoryData.properties || []);
      }
      setInvestmentForm({ propertyId: '', shares: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function approveProperty(propertyId) {
    setError('');
    try {
      await apiRequest(`/admin/properties/${propertyId}/approve`, {
        method: 'POST',
        headers: authHeader,
      });
      const pendingData = await apiRequest('/admin/properties/pending', { headers: authHeader });
      setPendingApprovals(pendingData.properties || []);
      const listData = await apiRequest('/properties');
      setProperties(listData.properties || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteProperty(propertyId) {
    setError('');
    try {
      await apiRequest(`/properties/${propertyId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      if (user && (user.role === 'seller' || user.role === 'admin')) {
        const inventoryData = await apiRequest('/seller/properties', { headers: authHeader });
        setSellerProperties(inventoryData.properties || []);
      }
      const listData = await apiRequest('/properties');
      setProperties(listData.properties || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Fractional Property Marketplace</p>
          <h1>Invest or list properties with a simple MVP workflow.</h1>
          <p className="subtext">Email/password auth. Buyer, Seller, and Admin roles.</p>
        </div>
        {user ? (
          <div className="card">
            <p className="muted">Signed in as</p>
            <p className="strong">{user.email}</p>
            <p className="tag">{user.role}</p>
            <button className="btn secondary" onClick={logout}>Log out</button>
          </div>
        ) : (
          <form className="card" onSubmit={submitAuth}>
            <div className="tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Log in
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>
            <label>
              Email
              <input type="email" name="email" value={authForm.email} onChange={handleAuthChange} required />
            </label>
            <label>
              Password
              <input type="password" name="password" value={authForm.password} onChange={handleAuthChange} required />
            </label>
            {authMode === 'register' && (
              <label>
                Role
                <select name="role" value={authForm.role} onChange={handleAuthChange}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn" type="submit">{authMode === 'register' ? 'Create account' : 'Sign in'}</button>
          </form>
        )}
      </header>

      {error && <div className="notice">{error}</div>}

      {user ? (
        <nav className="nav-tabs">
          <button
            type="button"
            className={activeSection === 'browse' ? 'active' : ''}
            onClick={() => setActiveSection('browse')}
          >
            {user.role === 'buyer' ? 'Properties for sale' : 'Browse'}
          </button>
          {(user.role === 'seller' || user.role === 'admin') && (
            <>
              <button
                type="button"
                className={activeSection === 'inventory' ? 'active' : ''}
                onClick={() => setActiveSection('inventory')}
              >
                My inventory
              </button>
              <button
                type="button"
                className={activeSection === 'list' ? 'active' : ''}
                onClick={() => setActiveSection('list')}
              >
                List property
              </button>
            </>
          )}
          {(user.role === 'buyer' || user.role === 'admin') && (
            <button
              type="button"
              className={activeSection === 'wallet' ? 'active' : ''}
              onClick={() => setActiveSection('wallet')}
            >
              Wallet
            </button>
          )}
          {user.role === 'admin' && (
            <button
              type="button"
              className={activeSection === 'approvals' ? 'active' : ''}
              onClick={() => setActiveSection('approvals')}
            >
              Approvals
            </button>
          )}
        </nav>
      ) : (
        <nav className="nav-tabs">
          <button
            type="button"
            className={authMode === 'login' ? 'active' : ''}
            onClick={() => setAuthMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={authMode === 'register' ? 'active' : ''}
            onClick={() => setAuthMode('register')}
          >
            Register
          </button>
        </nav>
      )}

      <section className="grid">
        {activeSection === 'browse' && (
          <div className="panel">
            <>
              <h2>Available properties</h2>
              <div className="list">
                {properties.map((property) => (
                  <article key={property.id} className="property">
                    <div>
                      <h3>{property.title}</h3>
                      <p className="muted">ID: {property.id}</p>
                      <p className="muted">{property.description || 'No description'}</p>
                      {property.photos && property.photos.length > 0 ? (
                        <div className="photo-card">
                          <img
                            src={getPhotoUrl(property.photos[photoIndex[property.id] || 0]?.url)}
                            alt={`${property.title} photo`}
                          />
                          <div className="photo-actions">
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => prevPhoto(property.id, property.photos.length)}
                            >
                              Prev
                            </button>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => nextPhoto(property.id, property.photos.length)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="muted">No photos yet.</p>
                      )}
                    </div>
                    <div className="meta">
                      <p>Seller: {property.seller_email}</p>
                      <p>Total: ${property.price_total}</p>
                      <p>Per share: ${Number(property.price_per_share || (property.price_total / property.shares_total)).toFixed(2)}</p>
                      <p>Value remaining: ${Number(property.value_remaining || (property.price_total / property.shares_total) * property.shares_available).toFixed(2)}</p>
                      <p>Shares: {property.shares_available} / {property.shares_total}</p>
                    </div>
                  </article>
                ))}
                {!properties.length && <p className="muted">No properties yet.</p>}
              </div>
            </>
          </div>
        )}

        {activeSection === 'list' && user && (user.role === 'seller' || user.role === 'admin') && (
          <div className="panel">
            <h2>List a property</h2>
            <form onSubmit={submitProperty} className="stack">
              {editingPropertyId && (
                <p className="muted">Editing property ID: {editingPropertyId}</p>
              )}
              <p className="muted">Edits and new listings go to admin approval before buyers can see them.</p>
              <label>
                Title
                <input name="title" value={propertyForm.title} onChange={handlePropertyChange} required />
              </label>
              <label>
                Description
                <textarea name="description" value={propertyForm.description} onChange={handlePropertyChange} />
              </label>
              <label>
                Photos
                <input name="photos" type="file" accept="image/*" multiple onChange={handlePhotoChange} />
              </label>
              <label>
                Total price
                <input name="priceTotal" type="number" min="1" value={propertyForm.priceTotal} onChange={handlePropertyChange} required />
              </label>
              <label>
                Total shares
                <input name="sharesTotal" type="number" min="1" value={propertyForm.sharesTotal} onChange={handlePropertyChange} required />
              </label>
              <div className="actions">
                <button className="btn" type="submit">{editingPropertyId ? 'Update property' : 'List property'}</button>
                {editingPropertyId && (
                  <button className="btn secondary" type="button" onClick={cancelEdit}>Cancel</button>
                )}
              </div>
            </form>
          </div>
        )}

        {activeSection === 'inventory' && user && (user.role === 'seller' || user.role === 'admin') && (
          <div className="panel">
            <h2>Your inventory</h2>
            <div className="list">
              {sellerProperties.map((property) => (
                  <article key={`seller-${property.id}`} className="property">
                    <div>
                      <h3>{property.title}</h3>
                      <p className="muted">ID: {property.id}</p>
                      <p className="muted">Status: {property.status}</p>
                      <p className="muted">Photos: {property.photos ? property.photos.length : 0}</p>
                      {property.photos && property.photos.length > 0 ? (
                        <div className="photo-card">
                          <img
                            src={getPhotoUrl(property.photos[photoIndex[property.id] || 0]?.url)}
                            alt={`${property.title} photo`}
                          />
                          <div className="photo-actions">
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => prevPhoto(property.id, property.photos.length)}
                            >
                              Prev
                            </button>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => nextPhoto(property.id, property.photos.length)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  <div className="meta">
                    <p>Total: ${property.price_total}</p>
                    <p>Shares: {property.shares_available} / {property.shares_total}</p>
                    <div className="actions">
                      <button className="btn secondary" type="button" onClick={() => startEdit(property)}>
                        Edit
                      </button>
                      <button className="btn" type="button" onClick={() => deleteProperty(property.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!sellerProperties.length && <p className="muted">No properties yet.</p>}
            </div>

            <h2>Investor holdings</h2>
            <div className="list">
              {sellerHoldings.map((holding, index) => (
                <article key={`${holding.property_id}-${holding.buyer_id || 'none'}-${index}`} className="property">
                  <div>
                    <h3>{holding.title}</h3>
                    <p className="muted">Property ID: {holding.property_id}</p>
                    <p className="muted">Buyer: {holding.buyer_email || 'No investors yet'}</p>
                  </div>
                  <div className="meta">
                    <p>Shares: {holding.shares ? Number(holding.shares) : 0}</p>
                    <p>Amount: ${holding.amount ? Number(holding.amount).toFixed(2) : '0.00'}</p>
                  </div>
                </article>
              ))}
              {!sellerHoldings.length && <p className="muted">No investor activity yet.</p>}
            </div>
          </div>
        )}

        {activeSection === 'browse' && user && (user.role === 'buyer' || user.role === 'admin') && (
          <div className="panel">
            <h2>Buyer actions</h2>
            <form onSubmit={submitInvestment} className="stack">
              <label>
                Property ID
                <input name="propertyId" value={investmentForm.propertyId} onChange={handleInvestmentChange} required />
              </label>
              <label>
                Shares to buy
                <input name="shares" type="number" min="1" value={investmentForm.shares} onChange={handleInvestmentChange} required />
              </label>
              <button className="btn secondary" type="submit">Buy shares</button>
            </form>
          </div>
        )}

        {(user && (user.role === 'buyer' || user.role === 'admin') && activeSection === 'wallet') && (
          <div className="panel">
            <h2>Buyer wallet</h2>
            <>
              <div className="list">
                {wallet.items.map((item) => (
                  <article key={item.id} className="property">
                    <div>
                      <h3>{item.title}</h3>
                      <p className="muted">Property ID: {item.property_id}</p>
                    </div>
                    <div className="meta">
                      <p>Shares: {item.shares}</p>
                      <p>Per share: ${Number(item.price_per_share).toFixed(2)}</p>
                      <p>Value: ${Number(item.current_value).toFixed(2)}</p>
                    </div>
                  </article>
                ))}
                {!wallet.items.length && <p className="muted">No holdings yet.</p>}
              </div>
              <p className="strong">Total value: ${Number(wallet.totalValue).toFixed(2)}</p>
            </>
          </div>
        )}

        {(user && user.role === 'admin' && activeSection === 'approvals') && (
          <div className="panel">
            <h2>Admin approvals</h2>
            <div className="list">
              {pendingApprovals.map((property) => (
                <article key={`pending-${property.id}`} className="property">
                  <div>
                    <h3>{property.title}</h3>
                    <p className="muted">ID: {property.id}</p>
                    <p className="muted">Seller: {property.seller_email}</p>
                  </div>
                  <div className="meta">
                    <p>Total: ${property.price_total}</p>
                    <p>Shares: {property.shares_total}</p>
                    <button className="btn" type="button" onClick={() => approveProperty(property.id)}>
                      Approve
                    </button>
                  </div>
                </article>
              ))}
              {!pendingApprovals.length && <p className="muted">No pending requests.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
