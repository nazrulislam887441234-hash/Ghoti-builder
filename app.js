// ==========================================
// FIREBASE MODULE IMPORTS (v9+ Modular)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBUhNhYvuo_FTvZ5RZR6Gn-4hsUY21S0XE",
  authDomain: "ghotimarket.firebaseapp.com",
  databaseURL: "https://ghotimarket-default-rtdb.firebaseio.com",
  projectId: "ghotimarket",
  storageBucket: "ghotimarket.firebasestorage.app",
  messagingSenderId: "481257644093",
  appId: "1:481257644093:web:0dfc3699d6b3c86afeca54",
  measurementId: "G-4SR8V2EKC1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
let currentShopId = null;
let currentCategoriesList = [];
let unsubscribeRealtime = null;

// ==========================================
// DOM ELEMENTS
// ==========================================
const loadingSpinner = document.getElementById('loading-spinner');
const categoriesGrid = document.getElementById('categories-grid');
const emptyState = document.getElementById('empty-state');
const statusBanner = document.getElementById('status-banner');

// Add Modal Elements
const openAddModalBtn = document.getElementById('open-add-modal-btn');
const addModal = document.getElementById('add-modal');
const closeAddModalBtn = document.getElementById('close-add-modal');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const addCategoryForm = document.getElementById('add-category-form');
const addCategoryNameInput = document.getElementById('add-category-name');
const addCategoryImageInput = document.getElementById('add-category-image');
const addImagePreviewBox = document.getElementById('add-image-preview-box');
const addImagePreview = document.getElementById('add-image-preview');
const submitAddBtn = document.getElementById('submit-add-btn');

// Edit Modal Elements
const editModal = document.getElementById('edit-modal');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editCategoryForm = document.getElementById('edit-category-form');
const editCategoryIdInput = document.getElementById('edit-category-id');
const editCategoryNameInput = document.getElementById('edit-category-name');
const editImagePreviewImg = document.getElementById('edit-image-preview-img');
const submitEditBtn = document.getElementById('submit-edit-btn');

// ==========================================
// AUTHENTICATION & INITIALIZATION
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Redirect to Login Page if not logged in
        window.location.href = "/login.html";
        return;
    }

    try {
        // Step 1: Determine Shop ID
        currentShopId = await determineShopId(user);

        if (!currentShopId) {
            showFatalError("Shop ID পাওয়া যায়নি। ক্যাটাগরি ম্যানেজমেন্ট নিষ্ক্রিয় রাখা হয়েছে।");
            return;
        }

        // Step 2: Verify Ownership (Security Check)
        const isAuthorized = await verifyShopOwnership(currentShopId, user.uid);
        if (!isAuthorized) {
            showFatalError("আপনার এই Shop-এর ক্যাটাগরি পরিচালনা করার অনুমতি নেই।");
            return;
        }

        // Step 3: Load Categories Realtime
        initRealtimeCategories(currentShopId);

    } catch (error) {
        console.error("Initialization Error:", error);
        showFatalError("ডাটা লোড করতে সমস্যা হয়েছে: " + error.message);
    }
});

// ==========================================
// HELPER: SHOP ID DETERMINATION
// Priority: 1. URL Parameter -> 2. LocalStorage -> 3. User UID
// ==========================================
async function determineShopId(user) {
    const urlParams = new URLSearchParams(window.location.search);
    let shopId = urlParams.get('shopId');

    if (shopId) return shopId;

    shopId = localStorage.getItem('shopId');
    if (shopId) return shopId;

    // Direct fallback if Document ID == UID
    if (user && user.uid) {
        return user.uid;
    }

    return null;
}

// ==========================================
// HELPER: VERIFY SHOP OWNERSHIP
// ==========================================
async function verifyShopOwnership(shopId, currentUserUid) {
    try {
        const shopDocRef = doc(db, "shops", shopId);
        const shopDocSnap = await getDoc(shopDocRef);

        if (!shopDocSnap.exists()) {
            return false;
        }

        const shopData = shopDocSnap.data();
        return shopData.uid === currentUserUid;
    } catch (err) {
        console.error("Shop Security Verification Error:", err);
        return false;
    }
}
// ==========================================
// HELPER: FETCH IMGBB API KEY FROM HTML
// ==========================================
async function getImgBBApiKey() {
    // HTML এর window.GHOTI_CONFIG থেকে Key নিবে
    const key = window.GHOTI_CONFIG?.IMGBB_API_KEY;
    
    if (!key || key === "e1da51b6d309ac3a5a235b5088ebc334") {
        throw new Error("ImgBB API Key HTML এ পাওয়া যায়নি। window.GHOTI_CONFIG এ Set করেন");
    }
    
    return key;
}
// ==========================================
// REALTIME DATA LISTENER
// ==========================================
function initRealtimeCategories(shopId) {
    const q = query(
        collection(db, "shops_categories"), 
        where("shopsId", "==", shopId)
    );

    unsubscribeRealtime = onSnapshot(q, (snapshot) => {
        currentCategoriesList = [];
        snapshot.forEach((doc) => {
            currentCategoriesList.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Local Sort: Latest first
        currentCategoriesList.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        renderCategoriesUI(currentCategoriesList);
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        showToast("ডাটা সিঙ্ক করতে ব্যর্থ হয়েছে", "error");
    });
}

// ==========================================
// RENDER UI
// ==========================================
function renderCategoriesUI(categories) {
    loadingSpinner.classList.add('hidden');

    if (categories.length === 0) {
        categoriesGrid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    categoriesGrid.classList.remove('hidden');
    categoriesGrid.innerHTML = '';

    categories.forEach(cat => {
        const dateStr = formatDate(cat.createdAt);
        
        const cardHTML = `
            <div class="category-card" data-id="${cat.id}">
                <div class="card-img-wrapper">
                    <img src="${escapeHTML(cat.imageUrl)}" alt="${escapeHTML(cat.categoryName)}" loading="lazy">
                </div>
                <div class="card-content">
                    <h3 class="category-title">${escapeHTML(cat.categoryName)}</h3>
                    <p class="created-date">Created: ${dateStr}</p>
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm edit-btn" data-id="${cat.id}">Edit</button>
                        <button class="btn btn-danger-outline btn-sm delete-btn" data-id="${cat.id}">Delete</button>
                    </div>
                </div>
            </div>
        `;
        categoriesGrid.insertAdjacentHTML('beforeend', cardHTML);
    });

    attachCardEventListeners();
}

// Attach Action Listeners to Rendered Cards
function attachCardEventListeners() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const catId = e.target.getAttribute('data-id');
            openEditModal(catId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const catId = e.target.getAttribute('data-id');
            handleDeleteCategory(catId);
        });
    });
}

// ==========================================
// CREATE CATEGORY (UPLOAD TO IMGBB & SAVE)
// ==========================================
addCategoryImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            addImagePreview.src = event.target.result;
            addImagePreviewBox.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        addImagePreviewBox.classList.add('hidden');
    }
});

addCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameValue = addCategoryNameInput.value.trim();
    const imageFile = addCategoryImageInput.files[0];

    // Validation
    if (!nameValue || nameValue.length < 2 || nameValue.length > 50) {
        showToast("ক্যাটাগরির নাম ২ থেকে ৫০ অক্ষরের মধ্যে হতে হবে", "error");
        return;
    }

    if (!imageFile) {
        showToast("অনুগ্রহ করে একটি ছবি নির্বাচন করুন", "error");
        return;
    }

    // Case-insensitive Duplicate Check
    const isDuplicate = currentCategoriesList.some(
        c => c.categoryName.trim().toLowerCase() === nameValue.toLowerCase()
    );

    if (isDuplicate) {
        showToast("This category already exists", "error");
        return;
    }

    setButtonLoading(submitAddBtn, true);

    try {
        // Step 1: Upload Image to ImgBB
        const apiKey = await getImgBBApiKey();
        const formData = new FormData();
        formData.append('image', imageFile);

        const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: 'POST',
            body: formData
        });

        const imgbbData = await imgbbResponse.json();

        if (!imgbbData.success) {
            throw new Error(imgbbData.error?.message || "ImgBB image upload failed.");
        }

        const uploadedImageUrl = imgbbData.data.url;

        // Step 2: Save to Firestore
        await addDoc(collection(db, "shops_categories"), {
            categoryName: nameValue,
            imageUrl: uploadedImageUrl,
            shopsId: currentShopId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        showToast("Category created successfully", "success");
        closeAddModal();

    } catch (err) {
        console.error("Create Category Error:", err);
        showToast("সমস্যা হয়েছে: " + err.message, "error");
    } finally {
        setButtonLoading(submitAddBtn, false);
    }
});

// ==========================================
// EDIT CATEGORY (NAME ONLY)
// ==========================================
function openEditModal(catId) {
    const category = currentCategoriesList.find(c => c.id === catId);
    if (!category) return;

    editCategoryIdInput.value = category.id;
    editCategoryNameInput.value = category.categoryName;
    editImagePreviewImg.src = category.imageUrl;

    editModal.classList.remove('hidden');
}

editCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const catId = editCategoryIdInput.value;
    const newName = editCategoryNameInput.value.trim();

    if (!newName || newName.length < 2 || newName.length > 50) {
        showToast("ক্যাটাগরির নাম ২ থেকে ৫০ অক্ষরের মধ্যে হতে হবে", "error");
        return;
    }

    // Duplicate Check excluding self
    const isDuplicate = currentCategoriesList.some(
        c => c.id !== catId && c.categoryName.trim().toLowerCase() === newName.toLowerCase()
    );

    if (isDuplicate) {
        showToast("This category already exists", "error");
        return;
    }

    setButtonLoading(submitEditBtn, true);

    try {
        const catRef = doc(db, "shops_categories", catId);
        
        // Strict Security Update: Only categoryName and updatedAt
        await updateDoc(catRef, {
            categoryName: newName,
            updatedAt: serverTimestamp()
        });

        showToast("Category updated successfully", "success");
        closeEditModal();

    } catch (err) {
        console.error("Update Error:", err);
        showToast("আপডেট করা সম্ভব হয়নি: " + err.message, "error");
    } finally {
        setButtonLoading(submitEditBtn, false);
    }
});

// ==========================================
// DELETE CATEGORY
// ==========================================
async function handleDeleteCategory(catId) {
    const confirmDelete = confirm("আপনি কি নিশ্চিত যে এই ক্যাটাগরিটি মুছে ফেলতে চান?");
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, "shops_categories", catId));
        showToast("Category deleted successfully", "success");
    } catch (err) {
        console.error("Delete Error:", err);
        showToast("মুছে ফেলা সম্ভব হয়নি", "error");
    }
}

// ==========================================
// MODAL CONTROLS & UTILITIES
// ==========================================
openAddModalBtn.addEventListener('click', () => {
    if (!currentShopId) {
        showToast("Shop ID পাওয়া যায়নি", "error");
        return;
    }
    addCategoryForm.reset();
    addImagePreviewBox.classList.add('hidden');
    addModal.classList.remove('hidden');
});

closeAddModalBtn.addEventListener('click', closeAddModal);
cancelAddBtn.addEventListener('click', closeAddModal);

closeEditModalBtn.addEventListener('click', closeEditModal);
cancelEditBtn.addEventListener('click', closeEditModal);

function closeAddModal() {
    addModal.classList.add('hidden');
}

function closeEditModal() {
    editModal.classList.add('hidden');
}

function setButtonLoading(button, isLoading) {
    const textSpan = button.querySelector('.btn-text');
    const spinner = button.querySelector('.btn-spinner');

    if (isLoading) {
        button.disabled = true;
        if (textSpan) textSpan.style.opacity = '0.5';
        if (spinner) spinner.classList.remove('hidden');
    } else {
        button.disabled = false;
        if (textSpan) textSpan.style.opacity = '1';
        if (spinner) spinner.classList.add('hidden');
    }
}

function showFatalError(msg) {
    loadingSpinner.classList.add('hidden');
    statusBanner.innerText = msg;
    statusBanner.classList.remove('hidden');
    openAddModalBtn.disabled = true;
}

function showToast(message, type = "success") {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function formatDate(timestamp) {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
