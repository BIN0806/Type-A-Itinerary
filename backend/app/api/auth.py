from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.auth import get_password_hash, verify_password, create_access_token, get_current_user
from ..db.models import User
from ..models.schemas import (
    UserCreate, UserLogin, Token, UserResponse,
    TicketBalanceResponse, TicketPurchaseRequest, TicketPurchaseResponse
)

router = APIRouter()


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        preferences={"walking_speed": "moderate"}
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token."""
    # Find user
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user


@router.get("/auth/tickets", response_model=TicketBalanceResponse)
async def get_ticket_balance(current_user: User = Depends(get_current_user)):
    """Get current user's ticket balance."""
    return TicketBalanceResponse(balance=current_user.ticket_balance)


@router.post("/auth/tickets/purchase", response_model=TicketPurchaseResponse)
async def purchase_tickets(
    request: TicketPurchaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Purchase tickets (simulated payment for demo).
    
    Packages:
    - "single": 1 ticket for $2
    - "bundle": 3 tickets for $5
    """
    # Define packages
    packages = {
        "single": {"tickets": 1, "price_cents": 200},
        "bundle": {"tickets": 3, "price_cents": 500}
    }
    
    package_info = packages[request.package]
    tickets_to_add = package_info["tickets"]
    
    # Update user's ticket balance
    current_user.ticket_balance += tickets_to_add
    db.commit()
    db.refresh(current_user)
    
    return TicketPurchaseResponse(
        success=True,
        tickets_added=tickets_to_add,
        new_balance=current_user.ticket_balance,
        message=f"Successfully purchased {tickets_to_add} ticket(s)!"
    )

