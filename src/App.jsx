import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import sdk from '@farcaster/frame-sdk'; 
import { 
  UserMinus, 
  UserPlus, 
  ExternalLink, 
  User, 
  Loader2, 
  AlertCircle, 
  Terminal, 
  Wifi, 
  LayoutDashboard, 
  List, 
  Users, 
  TrendingUp
} from 'lucide-react';

const API_KEY = "0CF2B474-BF71-4679-88FA-72CF70BD34AF";

export default function App() {
  const [targetFid, setTargetFid] = useState('');
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  
  const [viewMode, setViewMode] = useState('dashboard'); 
  const [activeTab, setActiveTab] = useState('unfollow'); 
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [isContextLoaded, setIsContextLoaded] = useState(false); 
  
  const [criticalError, setCriticalError] = useState(null);
  
  const [notFollowingBack, setNotFollowingBack] = useState([]);
  const [fans, setFans] = useState([]);
  const [mutuals, setMutuals] = useState([]);
  const [recentFollowers, setRecentFollowers] = useState([]);

  const [stats, setStats] = useState({
    totalFollowing: 0,
    totalFollowers: 0,
    ratio: 0
  });

  const [logs, setLogs] = useState([]);
  
  const addLog = (message, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${message}`, ...prev]);
    if (type === 'error') console.error(message);
  };

  const openProfile = (uname) => {
    // Farcaster içinde linki güvenli açmak için SDK kullanıyoruz
    try {
      sdk.actions.openUrl(`https://warpcast.com/${uname}`);
    } catch (e) {
      window.open(`https://warpcast.com/${uname}`, '_blank');
    }
  };

  const normalizeUser = (item) => {
    if (!item) return null;
    if (item.fid && item.username) return item;
    if (item.user && item.user.fid) return item.user;
    return null;
  };

  const fetchUsersWithCursor = async (endpoint, fid, type) => {
    let allUsers = [];
    let cursor = null;
    let pageCount = 0;
    const maxPages = 25; 

    addLog(`Starting ${type} fetch for FID: ${fid}...`);

    while (pageCount < maxPages) {
      try {
        const res = await axios.get(endpoint, {
          params: { 
            fid: parseInt(fid),
            viewer_fid: 3, 
            limit: 100, 
            cursor: cursor 
          },
          headers: { 'api_key': API_KEY, 'accept': 'application/json' }
        });

        let rawData = res.data.users || res.data.result?.users || [];
        const validUsers = rawData.map(normalizeUser).filter(u => u !== null);
        allUsers = [...allUsers, ...validUsers];
        
        setLoadingStatus(`Scanning ${type}... (${allUsers.length} users)`);
        
        cursor = res.data.next?.cursor || res.data.result?.next?.cursor;
        pageCount++;

        if (!cursor) break;
        await new Promise(r => setTimeout(r, 50)); 

      } catch (err) {
        const errMsg = err.response ? `API Error (${err.response.status})` : `Error: ${err.message}`;
        addLog(`Error fetching ${type}: ${errMsg}`, 'error');
        break; 
      }
    }
    return allUsers;
  };

  const analyzeFollowers = useCallback(async (fidToAnalyze) => {
    const fid = fidToAnalyze || targetFid;
    if (!fid) return;
    
    setIsLoading(true);
    setCriticalError(null);
    setLogs([]); 
    setNotFollowingBack([]);
    setFans([]);
    setMutuals([]);
    setCurrentUserProfile(null);
    
    addLog(`🚀 Deep Scan Analysis started for FID: ${fid}...`);

    try {
      setLoadingStatus("Connecting...");
      const userRes = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk`, {
          params: { fids: parseInt(fid), viewer_fid: 3 },
          headers: { 'api_key': API_KEY }
      });
      
      if (userRes.data.users?.[0]) {
          const user = userRes.data.users[0];
          setCurrentUserProfile(user);
          addLog(`✅ Target User: @${user.username}`);
      }

      setLoadingStatus("Scanning Following list...");
      const following = await fetchUsersWithCursor(`https://api.neynar.com/v2/farcaster/following`, fid, "Following");
      
      setLoadingStatus("Scanning Followers list...");
      const followers = await fetchUsersWithCursor(`https://api.neynar.com/v2/farcaster/followers`, fid, "Followers");

      setLoadingStatus("Calculating analytics...");
      addLog("Step 3: Crunching numbers...");
      
      const followingMap = new Map(following.map(u => [u.fid, u]));
      const followersMap = new Map(followers.map(u => [u.fid, u]));

      const dontFollowBackList = following.filter(u => !followersMap.has(u.fid));
      const fansList = followers.filter(u => !followingMap.has(u.fid));
      const mutualList = following.filter(u => followersMap.has(u.fid));

      setNotFollowingBack(dontFollowBackList);
      setFans(fansList);
      setMutuals(mutualList);
      setRecentFollowers(followers.slice(0, 5));

      setStats({
        totalFollowing: following.length,
        totalFollowers: followers.length,
        ratio: following.length > 0 ? (followers.length / following.length).toFixed(2) : 0
      });
      
      addLog(`🎉 Analysis complete! Mutuals: ${mutualList.length}`);

    } catch (err) {
      console.error(err);
      setCriticalError(err.message);
      addLog(`🔥 CRITICAL FAILURE: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  }, [targetFid]);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const context = await sdk.context;
        
        if (context && context.user) {
          const userFid = context.user.fid.toString();
          setTargetFid(userFid);
          addLog(`🔹 SDK Loaded: Logged in as FID ${userFid}`);
          setIsContextLoaded(true);
          
          analyzeFollowers(userFid);
        } else {
          addLog("🔹 SDK Context empty (Running in browser?)");
          // Eğer tarayıcıda çalışıyorsa ve targetFid boşsa varsayılanı ata
          if (!targetFid) {
              setTargetFid('19267'); 
          }
        }
        
        sdk.actions.ready();
        
      } catch (error) {
        console.error("SDK Error:", error);
        addLog(`SDK Error: ${error.message}`, 'error');
        // Hata olsa bile ready gönderelim
        try { sdk.actions.ready(); } catch(e) {}
      }
    };

    if (!isContextLoaded) {
      loadContext();
    }
  }, [analyzeFollowers, isContextLoaded, targetFid]);

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Following</div>
            <div className="text-2xl font-bold text-white">{stats.totalFollowing}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Followers</div>
            <div className="text-2xl font-bold text-white">{stats.totalFollowers}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden">
             <div className="absolute right-0 top-0 p-2 opacity-10"><TrendingUp size={40} /></div>
            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Ratio</div>
            <div className={`text-2xl font-bold ${stats.ratio > 1 ? 'text-green-400' : 'text-yellow-400'}`}>
                {stats.ratio}x
            </div>
            <div className="text-[10px] text-slate-500">Followers per Following</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Mutuals</div>
            <div className="text-2xl font-bold text-blue-400">{mutuals.length}</div>
             <div className="text-[10px] text-slate-500">Friends (Follow each other)</div>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-slate-300 font-bold mb-4 flex items-center gap-2">
            <Users size={18} /> Network Composition
        </h3>
        <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Followers ({stats.totalFollowers})</span>
                <span>Following ({stats.totalFollowing})</span>
            </div>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
                <div 
                    className="bg-purple-500 h-full" 
                    style={{ width: `${(stats.totalFollowers / (stats.totalFollowers + stats.totalFollowing || 1)) * 100}%` }}
                ></div>
                <div 
                    className="bg-slate-600 h-full flex-1"
                ></div>
            </div>
        </div>
        <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Mutual Connections ({mutuals.length})</span>
                <span>One-Sided ({notFollowingBack.length + fans.length})</span>
            </div>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
                <div 
                    className="bg-blue-500 h-full" 
                    style={{ width: `${(mutuals.length / (Math.max(stats.totalFollowing, stats.totalFollowers) || 1)) * 100}%` }}
                ></div>
            </div>
        </div>
      </div>

      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
        <h3 className="text-green-400 font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={18} /> Newest Followers
        </h3>
        <div className="space-y-3">
            {recentFollowers.map((user, idx) => (
                <div key={user.fid || idx} className="flex items-center justify-between border-b border-slate-700/50 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(user.username)}>
                        <img src={user.pfp_url} className="w-8 h-8 rounded-full bg-slate-600" />
                        <div>
                            <div className="font-bold text-sm">@{user.username}</div>
                            <div className="text-[10px] text-slate-400">FID: {user.fid}</div>
                        </div>
                    </div>
                    <div className="bg-green-500/20 text-green-400 text-[10px] px-2 py-1 rounded uppercase font-bold">
                        New
                    </div>
                </div>
            ))}
            {recentFollowers.length === 0 && <div className="text-slate-500 text-sm">No recent data available.</div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4 md:p-8 flex flex-col">
      <div className="max-w-4xl mx-auto w-full mb-6">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight">
                Unloop
                </h1>
                <p className="text-slate-500 text-xs">Farcaster Manager</p>
            </div>
            <div className="bg-slate-800 p-1 rounded-lg flex gap-1 border border-slate-700">
                <button 
                    onClick={() => setViewMode('dashboard')}
                    className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${viewMode === 'dashboard' ? 'bg-slate-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                >
                    <LayoutDashboard size={16} /> <span className="hidden sm:inline">Dashboard</span>
                </button>
                <button 
                    onClick={() => setViewMode('lists')}
                    className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${viewMode === 'lists' ? 'bg-slate-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                >
                    <List size={16} /> <span className="hidden sm:inline">Lists</span>
                </button>
            </div>
        </div>

        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 mb-6 flex flex-col sm:flex-row items-center gap-4 shadow-lg">
             {currentUserProfile ? (
                <div className="flex items-center gap-3 pr-4 border-r border-slate-700/50 mr-2">
                    <img src={currentUserProfile.pfp_url} className="w-10 h-10 rounded-full border-2 border-purple-500" />
                    <div>
                        <div className="font-bold">@{currentUserProfile.username}</div>
                        <div className="text-xs text-slate-400">FID: {currentUserProfile.fid}</div>
                    </div>
                </div>
            ) : (
                <div className="p-2 bg-slate-700 rounded-full">
                    <User size={20} />
                </div>
            )}
            
            <div className="flex-1 w-full flex gap-2">
                <input 
                    type="number" 
                    value={targetFid}
                    onChange={(e) => setTargetFid(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 w-full focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                    placeholder="Enter FID"
                />
                <button 
                    onClick={() => analyzeFollowers(targetFid)}
                    disabled={isLoading}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-2 text-sm"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : "Analyze"}
                </button>
            </div>
        </div>

        {criticalError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center mb-8">
                <div className="flex justify-center mb-2 text-red-500"><WifiOff size={32} /></div>
                <h3 className="text-lg font-bold text-red-400 mb-1">Connection Error</h3>
                <p className="text-slate-300 text-sm mb-2">{criticalError}</p>
            </div>
        )}

        {!criticalError && (
            <>
                {isLoading && (
                     <div className="bg-slate-800/80 rounded-xl p-10 text-center mb-6 border border-slate-700 border-dashed">
                        <Loader2 size={40} className="text-purple-500 animate-spin mx-auto mb-4" />
                        <div className="text-lg font-bold text-white mb-1">Scanning Network...</div>
                        <div className="text-slate-400 text-sm">{loadingStatus}</div>
                    </div>
                )}

                {!isLoading && (
                    viewMode === 'dashboard' ? renderDashboard() : (
                        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-h-[400px] relative flex flex-col animate-in fade-in duration-500">
                            <div className="flex border-b border-slate-700 shrink-0">
                                <button 
                                    onClick={() => setActiveTab('unfollow')}
                                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'unfollow' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
                                >
                                    Not Following Back <span className="ml-1 bg-slate-900 px-1.5 py-0.5 rounded-full text-[10px]">{notFollowingBack.length}</span>
                                </button>
                                <button 
                                    onClick={() => setActiveTab('fans')}
                                    className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'fans' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
                                >
                                    Fans <span className="ml-1 bg-slate-900 px-1.5 py-0.5 rounded-full text-[10px]">{fans.length}</span>
                                </button>
                            </div>

                            <div className="p-4 overflow-y-auto flex-1 max-h-[500px]">
                                {(activeTab === 'unfollow' ? notFollowingBack : fans).length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
                                        <Wifi size={40} className="mb-3 opacity-20" />
                                        <p className="font-medium">List is empty.</p>
                                    </div>
                                ) : (
                                    (activeTab === 'unfollow' ? notFollowingBack : fans).map(user => (
                                        <div key={user.fid} className="flex items-center justify-between p-3 hover:bg-slate-700/50 rounded-lg transition-colors group border-b border-slate-700/50 last:border-0">
                                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(user.username)}>
                                                <img src={user.pfp_url} className="w-10 h-10 rounded-full bg-slate-600 object-cover" />
                                                <div>
                                                    <div className="font-bold text-sm">@{user.username}</div>
                                                    <div className="text-xs text-slate-400 line-clamp-1">{user.profile?.bio?.text}</div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => openProfile(user.username)}
                                                className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors ${
                                                    activeTab === 'unfollow' 
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                                                    : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                                                }`}
                                            >
                                                {activeTab === 'unfollow' ? 'Unfollow' : 'Follow'} <ExternalLink size={12}/>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )
                )}
            </>
        )}
      </div>

      <div className="max-w-4xl mx-auto w-full mt-6">
         <details className="group">
            <summary className="list-none cursor-pointer text-slate-500 text-xs flex items-center gap-2 hover:text-slate-300">
                <Terminal size={12} /> Toggle Debug Console
            </summary>
            <div className="mt-2 bg-black border border-slate-800 h-32 overflow-y-auto p-4 font-mono text-xs rounded-xl shadow-2xl">
                {logs.map((log, i) => (
                    <div key={i} className={`mb-1 border-b border-white/5 pb-1 break-words ${log.includes('Error') || log.includes('FAILURE') ? 'text-red-400 font-bold' : 'text-green-400'}`}>
                        {log}
                    </div>
                ))}
            </div>
         </details>
      </div>

    </div>
  );
}
